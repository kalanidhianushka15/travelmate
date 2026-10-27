import os
from typing import Any, Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from . import storage
from .planner import build_plan, scored_places
from .suggester import VIBES, suggest
from .transport import ORIGINS, get_origin, travel_options

app = FastAPI(title="TravelMate API", version="2.2.0")

# Which websites may call this API. Local Vite is always allowed; add your Vercel URL with
# FRONTEND_ORIGINS=https://travelmate.vercel.app (comma-separate several). Vercel preview links
# (https://<anything>.vercel.app) are allowed too.
extra_origins = [o.strip().rstrip("/") for o in os.getenv("FRONTEND_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", *extra_origins],
    allow_origin_regex=r"https://[a-z0-9-]+\.vercel\.app",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SuggestRequest(BaseModel):
    vibes: list[str] = []
    text: str = Field(default="", max_length=300)
    month: int | None = Field(default=None, ge=1, le=12)
    budget_level: int | None = Field(default=None, ge=1, le=3)


class TripRequest(BaseModel):
    destination: str = Field(min_length=2, max_length=80)
    days: int = Field(ge=1, le=14)
    group_size: int = Field(ge=1, le=20)
    budget: float = Field(gt=0, le=10_000_000)
    interests: list[str] = []
    pace: Literal["relaxed", "balanced", "packed"] = "balanced"
    stay_tier: Literal["budget", "mid", "premium"] = "mid"
    start_date: str | None = None  # "YYYY-MM-DD", optional
    must_include: list[str] = []
    skip: list[str] = []

    @field_validator("start_date")
    @classmethod
    def check_date(cls, value: str | None):
        if value:
            from datetime import date
            date.fromisoformat(value)  # raises a clear 422 error if the format is wrong
        return value or None


def summary(dest: dict) -> dict:
    return {
        "id": dest["id"], "name": dest["name"], "state": dest["state"], "tagline": dest["tagline"],
        "cost_level": dest["cost_level"], "ideal_days": dest["ideal_days"],
        "best_months": dest["best_months"], "top_vibes": sorted(dest["vibes"], key=dest["vibes"].get, reverse=True)[:3],
        "place_count": len(dest["attractions"]),
    }


def require_destination(dest_id: str) -> dict:
    dest = storage.get_destination(dest_id)
    if not dest:
        raise HTTPException(status_code=404, detail=f"We don't have '{dest_id}' yet. Pick one of the listed destinations.")
    return dest


@app.get("/")
def root():
    return {"message": "TravelMate API is running", "docs": "/docs"}


@app.get("/api/health")
def health():
    return {"status": "ok", "database": storage.database_mode(), "destinations": len(storage.all_destinations())}


@app.get("/api/vibes")
def vibes():
    return [{"id": key, "label": meta["label"]} for key, meta in VIBES.items()]


@app.get("/api/destinations")
def destinations():
    return [summary(d) for d in storage.all_destinations()]


@app.get("/api/destinations/{dest_id}")
def destination_detail(dest_id: str, interests: str = "", budget: float = 20000, group_size: int = 2, days: int = 3):
    """Full destination info plus every tourist place, scored for this traveller."""
    dest = require_destination(dest_id)
    chosen = [i for i in interests.split(",") if i]
    places = scored_places(dest, chosen, budget, max(1, group_size), max(1, days))
    info = {k: v for k, v in dest.items() if k != "attractions"}
    return {**info, "places": places}


@app.get("/api/attractions")
def attractions(destination: str | None = None):
    """Kept from v1: raw attraction list, optionally filtered by destination."""
    if destination:
        return require_destination(destination)["attractions"]
    return [p | {"destination": d["name"]} for d in storage.all_destinations() for p in d["attractions"]]


@app.post("/api/suggest")
def suggest_places(req: SuggestRequest):
    if not req.vibes and not req.text.strip():
        raise HTTPException(status_code=400, detail="Pick at least one vibe or describe what you want.")
    return suggest(storage.all_destinations(), req.vibes, req.text, req.month, req.budget_level)


@app.post("/api/generate")
def generate(req: TripRequest):
    dest = require_destination(req.destination)
    return build_plan(dest, req)


class TravelRequest(BaseModel):
    origin: str = Field(min_length=2, max_length=60)
    destination: str = Field(min_length=2, max_length=80)
    travellers: int = Field(default=1, ge=1, le=20)
    date: str | None = None  # "YYYY-MM-DD", optional


@app.get("/api/origins")
def origins():
    """Cities you can start from for the 'Book tickets' section."""
    return [{"id": o["id"], "name": o["name"]} for o in ORIGINS]


@app.post("/api/travel-options")
def get_travel_options(req: TravelRequest):
    origin = get_origin(req.origin)
    if not origin:
        raise HTTPException(status_code=404, detail=f"We don't have travel data for '{req.origin}' yet.")
    dest = require_destination(req.destination)
    return travel_options(origin, dest, req.travellers, req.date or None)


@app.get("/api/trips")
def get_trips():
    return storage.list_trips()


@app.post("/api/trips")
def save_trip(payload: dict[str, Any]):
    if not payload.get("destination") or not payload.get("days"):
        raise HTTPException(status_code=400, detail="Trip data is incomplete.")
    return storage.save_trip(payload)


@app.put("/api/trips/{trip_id}")
def update_trip(trip_id: str, payload: dict[str, Any]):
    """Update a saved trip, e.g. after you add a booking reference."""
    updated = storage.update_trip(trip_id, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Trip not found.")
    return updated


@app.delete("/api/trips/{trip_id}")
def delete_trip(trip_id: str):
    if not storage.delete_trip(trip_id):
        raise HTTPException(status_code=404, detail="Trip not found.")
    return {"deleted": True, "id": trip_id}


@app.post("/api/admin/reseed")
def reseed():
    """Reload destinations.json into the database after you edit the file. Saved trips are kept."""
    return {"reseeded": storage.reseed_destinations()}
