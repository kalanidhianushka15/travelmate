"""Database tables (SQLAlchemy ORM). Works with MySQL in production and SQLite for quick local runs.

    destinations 1 ──< attractions
                 1 ──< hotel_areas
                 1 ──< destination_notes   (tips, don't-miss items, local food)
                 1 ──< trips 1 ──< bookings

Lists that are only ever read together (vibes, best months, cost table, tags) are stored in JSON
columns; MySQL 5.7+ supports JSON natively.
"""
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Destination(Base):
    __tablename__ = "destinations"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)          # e.g. "goa"
    name: Mapped[str] = mapped_column(String(80))
    state: Mapped[str] = mapped_column(String(80))
    tagline: Mapped[str] = mapped_column(String(200))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    cost_level: Mapped[int] = mapped_column(Integer)                        # 1 cheap .. 3 pricey
    ideal_days_min: Mapped[int] = mapped_column(Integer)
    ideal_days_max: Mapped[int] = mapped_column(Integer)
    getting_there: Mapped[str] = mapped_column(Text)
    getting_around: Mapped[str] = mapped_column(Text)
    vibes: Mapped[dict] = mapped_column(JSON)                               # {"beaches": 1.0, ...}
    best_months: Mapped[list] = mapped_column(JSON)
    avoid_months: Mapped[list] = mapped_column(JSON)
    peak_months: Mapped[list] = mapped_column(JSON)
    costs: Mapped[dict] = mapped_column(JSON)                               # stay ranges, food per day, per km
    transport: Mapped[dict] = mapped_column(JSON)                           # airport, railhead, bus info

    attractions: Mapped[list["Attraction"]] = relationship(back_populates="destination", cascade="all, delete-orphan", order_by="Attraction.position")
    hotel_areas: Mapped[list["HotelArea"]] = relationship(cascade="all, delete-orphan", order_by="HotelArea.position")
    notes: Mapped[list["DestinationNote"]] = relationship(cascade="all, delete-orphan", order_by="DestinationNote.position")


class Attraction(Base):
    __tablename__ = "attractions"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)          # e.g. "goa-baga"
    destination_id: Mapped[str] = mapped_column(ForeignKey("destinations.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(120))
    area: Mapped[str] = mapped_column(String(80))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    tags: Mapped[list] = mapped_column(JSON)
    appeal: Mapped[float] = mapped_column(Float)
    cost: Mapped[int] = mapped_column(Integer)                              # ₹ per person
    visit_hours: Mapped[float] = mapped_column(Float)
    best_time: Mapped[str] = mapped_column(String(20))                      # sunrise/morning/any/afternoon/sunset/evening
    must_see: Mapped[bool] = mapped_column(Boolean, default=False)
    closed_days: Mapped[list] = mapped_column(JSON)                         # ["Fri"]
    description: Mapped[str] = mapped_column(Text)
    tip: Mapped[str | None] = mapped_column(Text, nullable=True)

    destination: Mapped[Destination] = relationship(back_populates="attractions")


class HotelArea(Base):
    __tablename__ = "hotel_areas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    destination_id: Mapped[str] = mapped_column(ForeignKey("destinations.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    area: Mapped[str] = mapped_column(String(120))
    best_for: Mapped[str] = mapped_column(String(200))
    note: Mapped[str] = mapped_column(String(200))


class DestinationNote(Base):
    __tablename__ = "destination_notes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    destination_id: Mapped[str] = mapped_column(ForeignKey("destinations.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20))                           # "tip" | "dont_miss" | "food"
    position: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[str] = mapped_column(Text)


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)          # uuid4
    destination_id: Mapped[str | None] = mapped_column(String(40), index=True, nullable=True)
    days: Mapped[int] = mapped_column(Integer, default=0)
    group_size: Mapped[int] = mapped_column(Integer, default=0)
    total_cost: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    plan: Mapped[dict] = mapped_column(JSON)                                # the full generated plan

    bookings: Mapped[list["Booking"]] = relationship(back_populates="trip", cascade="all, delete-orphan", order_by="Booking.id")


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trip_id: Mapped[str] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"), index=True)
    mode: Mapped[str] = mapped_column(String(20))                           # flight / train / bus
    ref: Mapped[str] = mapped_column(String(60))                            # PNR or booking reference
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    trip: Mapped[Trip] = relationship(back_populates="bookings")
