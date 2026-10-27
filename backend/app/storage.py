"""Data access for TravelMate (MySQL via SQLAlchemy).

Set DATABASE_URL in backend/.env, for example
    DATABASE_URL=mysql+pymysql://root:yourpassword@localhost:3306/travelmate
If DATABASE_URL is empty, a local SQLite file (travelmate.db) is used so the app still runs.

On startup the tables are created automatically, and data/destinations.json is loaded into them
the first time (or when the JSON has more destinations than the database).
"""
import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, selectinload, sessionmaker

from .models import Attraction, Base, Booking, Destination, DestinationNote, HotelArea, Trip

load_dotenv()
BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = Path(__file__).parent / "data" / "destinations.json"


def _engine_from_env():
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        return create_engine(f"sqlite:///{BACKEND_DIR / 'travelmate.db'}", connect_args={"check_same_thread": False})

    if url.startswith("mysql://"):
        url = "mysql+pymysql://" + url[len("mysql://"):]  # Aiven shows mysql://, PyMySQL needs mysql+pymysql://
    url = url.replace("?ssl-mode=REQUIRED", "").replace("&ssl-mode=REQUIRED", "")  # PyMySQL doesn't understand ssl-mode

    connect_args = {}
    ca_text = os.getenv("DB_SSL_CA_CERT", "").strip()  # paste the CA certificate text (cloud databases)
    if ca_text:
        ca_file = Path(tempfile.gettempdir()) / "travelmate-db-ca.pem"
        ca_file.write_text(ca_text.replace("\\n", "\n"), encoding="utf-8")
        connect_args["ssl"] = {"ca": str(ca_file)}
    elif os.getenv("DB_SSL", "").lower() in ("1", "true", "yes", "required"):
        connect_args["ssl"] = {"check_hostname": False}  # encrypted connection without verifying the certificate

    # pool_pre_ping + pool_recycle stop "MySQL server has gone away" after the database sits idle.
    return create_engine(url, connect_args=connect_args, pool_pre_ping=True, pool_recycle=280)


engine = _engine_from_env()
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

with DATA_FILE.open(encoding="utf-8") as f:
    FILE_DESTINATIONS: list[dict[str, Any]] = json.load(f)


# ---------- setup and seeding ----------

def _destination_row(d: dict) -> Destination:
    row = Destination(
        id=d["id"], name=d["name"], state=d["state"], tagline=d["tagline"], lat=d["lat"], lng=d["lng"],
        cost_level=d["cost_level"], ideal_days_min=d["ideal_days"][0], ideal_days_max=d["ideal_days"][1],
        getting_there=d["getting_there"], getting_around=d["getting_around"], vibes=d["vibes"],
        best_months=d["best_months"], avoid_months=d["avoid_months"], peak_months=d.get("peak_months", []),
        costs=d["costs"], transport=d.get("transport", {}),
    )
    row.attractions = [
        Attraction(id=a["id"], position=i, name=a["name"], area=a["area"], lat=a["lat"], lng=a["lng"],
                   tags=a["tags"], appeal=a["appeal"], cost=a["cost"], visit_hours=a["visit_hours"],
                   best_time=a["best_time"], must_see=a.get("must_see", False),
                   closed_days=a.get("closed_days", []), description=a["description"], tip=a.get("tip"))
        for i, a in enumerate(d["attractions"])
    ]
    row.hotel_areas = [HotelArea(position=i, **h) for i, h in enumerate(d["hotel_areas"])]
    row.notes = (
        [DestinationNote(kind="tip", position=i, text=t) for i, t in enumerate(d["tips"])]
        + [DestinationNote(kind="dont_miss", position=i, text=t) for i, t in enumerate(d["dont_miss"])]
        + [DestinationNote(kind="food", position=i, text=t) for i, t in enumerate(d["local_food"])]
    )
    return row


def init_db() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as s:
        count = s.scalar(select(func.count()).select_from(Destination))
        if count < len(FILE_DESTINATIONS):
            _load_destinations(s)
    _cache.clear()


def _load_destinations(s: Session) -> int:
    for row in s.scalars(select(Destination)).all():
        s.delete(row)
    s.flush()
    s.add_all([_destination_row(d) for d in FILE_DESTINATIONS])
    s.commit()
    print(f"Loaded {len(FILE_DESTINATIONS)} destinations into the database.")
    return len(FILE_DESTINATIONS)


def reseed_destinations() -> int:
    with SessionLocal() as s:
        n = _load_destinations(s)
    _cache.clear()
    return n


def database_mode() -> str:
    return engine.dialect.name  # "mysql" or "sqlite"


# ---------- destinations (read-only, cached in memory after the first load) ----------

_cache: dict[str, list[dict]] = {}


def _destination_dict(row: Destination) -> dict[str, Any]:
    notes = {"tip": [], "dont_miss": [], "food": []}
    for n in row.notes:
        notes[n.kind].append(n.text)
    return {
        "id": row.id, "name": row.name, "state": row.state, "tagline": row.tagline,
        "lat": row.lat, "lng": row.lng, "vibes": row.vibes, "cost_level": row.cost_level,
        "best_months": row.best_months, "avoid_months": row.avoid_months, "peak_months": row.peak_months,
        "ideal_days": [row.ideal_days_min, row.ideal_days_max],
        "getting_there": row.getting_there, "getting_around": row.getting_around,
        "costs": row.costs, "transport": row.transport,
        "hotel_areas": [{"area": h.area, "best_for": h.best_for, "note": h.note} for h in row.hotel_areas],
        "tips": notes["tip"], "dont_miss": notes["dont_miss"], "local_food": notes["food"],
        "attractions": [
            {"id": a.id, "name": a.name, "area": a.area, "lat": a.lat, "lng": a.lng, "tags": a.tags,
             "appeal": a.appeal, "cost": a.cost, "visit_hours": a.visit_hours, "best_time": a.best_time,
             "must_see": a.must_see, "closed_days": a.closed_days, "description": a.description,
             **({"tip": a.tip} if a.tip else {})}
            for a in row.attractions
        ],
    }


def all_destinations() -> list[dict[str, Any]]:
    if "all" not in _cache:
        with SessionLocal() as s:
            rows = s.scalars(
                select(Destination)
                .options(selectinload(Destination.attractions), selectinload(Destination.hotel_areas), selectinload(Destination.notes))
                .order_by(Destination.name)
            ).all()
            # keep the original JSON order (Goa, Hyderabad, ...) for a stable list
            order = {d["id"]: i for i, d in enumerate(FILE_DESTINATIONS)}
            _cache["all"] = sorted((_destination_dict(r) for r in rows), key=lambda d: order.get(d["id"], 999))
    return [dict(d) for d in _cache["all"]]


def get_destination(dest_id_or_name: str) -> dict[str, Any] | None:
    key = dest_id_or_name.strip().lower()
    return next((d for d in all_destinations() if d["id"] == key or d["name"].lower() == key), None)


# ---------- trips and bookings ----------

def _bookings_from_payload(payload: dict) -> list[Booking]:
    raw = (payload.get("travel") or {}).get("bookings") or {}
    items = raw.items() if isinstance(raw, dict) else [(b.get("mode"), b) for b in raw]
    out = []
    for mode, b in items:
        if mode and b and b.get("ref"):
            out.append(Booking(mode=str(mode)[:20], ref=str(b["ref"])[:60]))
    return out


def _trip_dict(t: Trip) -> dict[str, Any]:
    plan = dict(t.plan or {})
    if t.bookings or plan.get("travel"):
        travel = dict(plan.get("travel") or {})
        travel["bookings"] = {b.mode: {"ref": b.ref, "saved_at": b.saved_at.isoformat() if b.saved_at else None}
                              for b in t.bookings}
        plan["travel"] = travel
    created = t.created_at if t.created_at.tzinfo else t.created_at.replace(tzinfo=timezone.utc)
    return {**plan, "id": t.id, "created_at": created.isoformat()}


def _apply(t: Trip, payload: dict) -> None:
    clean = {k: v for k, v in payload.items() if k not in ("id", "created_at")}
    dest = clean.get("destination")
    t.destination_id = dest.get("id") if isinstance(dest, dict) else dest
    req = clean.get("request") or {}
    t.days = int(req.get("days") or len(clean.get("days") or []))
    t.group_size = int(req.get("group_size") or 0)
    t.total_cost = int((clean.get("costs") or {}).get("total") or 0)
    t.plan = clean
    t.bookings = _bookings_from_payload(clean)


def list_trips() -> list[dict[str, Any]]:
    with SessionLocal() as s:
        rows = s.scalars(select(Trip).options(selectinload(Trip.bookings)).order_by(Trip.created_at.desc())).all()
        return [_trip_dict(t) for t in rows]


def save_trip(payload: dict[str, Any]) -> dict[str, Any]:
    with SessionLocal() as s:
        t = Trip(id=str(uuid.uuid4()), created_at=datetime.now(timezone.utc))
        _apply(t, payload)
        s.add(t)
        s.commit()
        s.refresh(t)
        return _trip_dict(t)


def update_trip(trip_id: str, payload: dict[str, Any]) -> dict[str, Any] | None:
    with SessionLocal() as s:
        t = s.get(Trip, trip_id, options=[selectinload(Trip.bookings)])
        if not t:
            return None
        _apply(t, payload)
        s.commit()
        s.refresh(t)
        return _trip_dict(t)


def delete_trip(trip_id: str) -> bool:
    with SessionLocal() as s:
        t = s.get(Trip, trip_id)
        if not t:
            return False
        s.delete(t)
        s.commit()
        return True


init_db()
