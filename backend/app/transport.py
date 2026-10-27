"""Getting there: flight / train / bus options from the traveller's city to the destination.

We don't sell tickets ourselves (that needs IRCTC agent access or paid airline/bus APIs).
Instead we estimate time and fare with simple rules, then send the user to the official
booking site with the details ready.

Estimates (one way, per person):
  flight : available if the trip is over 350 km. Fare 2,500 + 3.2 per km (range 0.75x to 1.5x)
  train  : sleeper ~0.45/km (low) to 3AC ~1.3/km (high). Speed about 55 km/h
  bus    : seater ~1.3/km to AC sleeper ~2.6/km. Speed about 45 km/h, only up to 1,200 km
Road and rail distances are taken as straight-line distance x 1.25.
"""
import json
from pathlib import Path
from urllib.parse import quote

from .planner import km_between

ORIGINS = json.loads((Path(__file__).parent / "data" / "origins.json").read_text(encoding="utf-8"))


def get_origin(origin_id: str) -> dict | None:
    key = origin_id.strip().lower()
    return next((o for o in ORIGINS if o["id"] == key or o["name"].lower() == key), None)


def _hours(h: float) -> str:
    h = max(h, 0.5)
    whole, mins = int(h), int(round((h - int(h)) * 60 / 15) * 15)
    if mins == 60:
        whole, mins = whole + 1, 0
    return f"{whole} hr" + (f" {mins} min" if mins else "") if whole else f"{mins} min"


def _round(x: float) -> int:
    return int(round(x / 50) * 50)


def travel_options(origin: dict, dest: dict, travellers: int, travel_date: str | None) -> dict:
    t = dest.get("transport", {})
    straight = km_between(origin, dest) / 1.3  # km_between adds a 1.3 road factor; undo it for air distance
    ground = straight * 1.25

    if straight < 25:
        return {"same_city": True, "origin": origin["name"], "destination": dest["name"], "options": []}

    options = []

    # ---- Flight ----
    air = t.get("airport")
    if air and straight >= 350:
        fare = 2500 + 3.2 * straight
        last_mile_h = air["km"] / 35
        total_h = 2.0 + 0.75 + straight / 700 + last_mile_h  # airport time + taxiing + flying + to the city
        q = f"Flights from {origin['airport']} to {air['code']}" + (f" on {travel_date}" if travel_date else "")
        options.append({
            "mode": "flight", "available": True,
            "from_point": f"{origin['name']} airport ({origin['airport']})",
            "to_point": f"{air['name']} airport ({air['code']})",
            "last_mile": f"{air['km']} km from the airport to {dest['name']}",
            "duration": _hours(total_h), "duration_hours": round(total_h, 1),
            "fare_low": _round(fare * 0.75), "fare_high": _round(fare * 1.5),
            "note": air.get("note") or "Book 3–6 weeks ahead for better fares.",
            "links": [
                {"label": "Search on Google Flights", "url": "https://www.google.com/travel/flights?q=" + quote(q)},
            ],
        })
    elif air:
        options.append({"mode": "flight", "available": False,
                        "note": f"It's only about {round(ground)} km by road, so flying isn't worth it. Take a train or bus."})

    # ---- Train ----
    rail = t.get("rail")
    if rail:
        total_h = ground / 55 + rail["km"] / 35
        options.append({
            "mode": "train", "available": True,
            "from_point": origin["station"], "to_point": rail["name"],
            "last_mile": f"{rail['km']} km from the station to {dest['name']}" if rail["km"] > 5 else "Station is in the city",
            "duration": _hours(total_h), "duration_hours": round(total_h, 1),
            "fare_low": _round(max(200, 0.45 * ground)), "fare_high": _round(max(600, 1.3 * ground)),
            "fare_note": "Sleeper to 3AC",
            "note": rail.get("note") or "IRCTC bookings open 60 days before the journey. Popular trains fill up fast.",
            "links": [{"label": "Book on IRCTC", "url": "https://www.irctc.co.in/nget/train-search"}],
        })
    else:
        options.append({"mode": "train", "available": False, "note": t.get("rail_note", "No direct railway here.")})

    # ---- Bus ----
    if t.get("bus") and ground <= 1200:
        total_h = ground / 45
        options.append({
            "mode": "bus", "available": True,
            "from_point": origin["name"], "to_point": dest["name"],
            "last_mile": "Drops you in or near the city",
            "duration": _hours(total_h), "duration_hours": round(total_h, 1),
            "fare_low": _round(max(300, 1.3 * ground)), "fare_high": _round(max(700, 2.6 * ground)),
            "fare_note": "Seater to AC sleeper",
            "note": t.get("bus_note") or ("Overnight buses save a hotel night." if total_h > 8 else "Good for short trips."),
            "links": [{"label": "Search on redBus", "url": "https://www.redbus.in/"}],
        })
    else:
        options.append({"mode": "bus", "available": False,
                        "note": f"About {round(ground)} km by road is too long for a comfortable bus trip."})

    for o in options:
        if o["available"]:
            o["round_trip_group_low"] = o["fare_low"] * 2 * travellers
            o["round_trip_group_high"] = o["fare_high"] * 2 * travellers
            o["round_trip_group_estimate"] = _round((o["fare_low"] + o["fare_high"]) / 2 * 2 * travellers)

    available = [o for o in options if o["available"]]
    cheapest = min(available, key=lambda o: o["fare_low"])["mode"] if available else None
    fastest = min(available, key=lambda o: o["duration_hours"])["mode"] if available else None
    return {
        "same_city": False, "origin": origin["name"], "destination": dest["name"],
        "distance_km": round(ground), "travellers": travellers, "date": travel_date,
        "cheapest": cheapest, "fastest": fastest, "options": options,
        "disclaimer": "Fares and times are estimates for planning. Check the booking site for live prices and seats.",
    }
