"""The itinerary engine: scoring places, building day plans with timings, and estimating costs.

Everything here is plain rule-based logic, so you can explain every number in a viva.

1. score_place()   - gives each tourist place a score out of 100 for this traveller.
2. build_plan()    - fills each day with places using a greedy "nearest next stop" method,
                     respecting a daily hour limit, closing days and best time of day.
3. estimate_costs() - stay + food + local transport + entry tickets + a small buffer.
"""
import math
from datetime import date, timedelta
from typing import Any

PACE_HOURS = {"relaxed": 6.0, "balanced": 8.0, "packed": 10.0}

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
WEEKDAY_NAMES = {"Mon": "Mondays", "Tue": "Tuesdays", "Wed": "Wednesdays", "Thu": "Thursdays",
                 "Fri": "Fridays", "Sat": "Saturdays", "Sun": "Sundays"}
PINNED_BONUS = 200  # a "must include" place always beats an unpinned one


# ---------- distance and travel time ----------

def km_between(a: dict, b: dict) -> float:
    """Straight-line (haversine) distance in km, multiplied by 1.3 to approximate real roads."""
    r = 6371
    lat1, lng1, lat2, lng2 = map(math.radians, [a["lat"], a["lng"], b["lat"], b["lng"]])
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    return round(2 * r * math.asin(math.sqrt(h)) * 1.3, 1)


def travel_minutes(km: float, hilly: bool) -> int:
    if km < 0.8:
        return 10  # walking distance
    speed = 18 if km < 8 else 28 if km < 30 else 40  # city traffic vs open road (km/h)
    if hilly:
        speed *= 0.7
    return int(round(km / speed * 60 / 5) * 5) + 10  # +10 min for parking, tickets, finding the spot


# ---------- scoring ----------

def score_place(place: dict, interests: list[str], per_person_daily_budget: float) -> dict:
    """Score out of 100.
    interest 40 | must-see 15 | appeal 20 | cost fit 15 | effort 10
    """
    chosen = {i.lower() for i in interests}
    if chosen:
        overlap = len(chosen & set(place["tags"]))
        interest = round(40 * min(1, overlap / min(2, len(chosen))))
    else:
        interest = 20  # no preference given: neutral

    must_see = 15 if place.get("must_see") else 0
    appeal = round(20 * min(1, max(0, (place["appeal"] - 3.5) / 1.5)))

    if place["cost"] == 0:
        cost_fit = 15
    else:
        ratio = place["cost"] / max(1, per_person_daily_budget)
        cost_fit = max(0, round(15 * (1 - min(1, ratio * 1.5))))

    effort = 10 if place["visit_hours"] <= 2 else 6 if place["visit_hours"] <= 4 else 3
    total = interest + must_see + appeal + cost_fit + effort
    return {"total": total, "interest": interest, "must_see": must_see, "appeal": appeal,
            "cost_fit": cost_fit, "effort": effort}


def scored_places(dest: dict, interests: list[str], budget: float, group_size: int, days: int) -> list[dict]:
    per_person_daily = budget / max(1, group_size) / max(1, days)
    out = []
    for p in dest["attractions"]:
        s = score_place(p, interests, per_person_daily)
        out.append({**p, "score": s["total"], "score_breakdown": s})
    out.sort(key=lambda p: (p["score"], p["appeal"]), reverse=True)
    return out


# ---------- day planning ----------

def _fmt(minutes: int) -> str:
    h, m = divmod(int(minutes), 60)
    suffix = "am" if h < 12 else "pm"
    h12 = h % 12 or 12
    return f"{h12}:{m:02d} {suffix}"


def _day_title(places: list[dict]) -> str:
    areas: list[str] = []
    for p in places:
        if p["area"] not in areas:
            areas.append(p["area"])
    if not areas:
        return "Free day"
    return " & ".join(areas[:2]) + (" and around" if len(areas) > 2 else "")


def _time_block(order_items: list[dict], base: dict, hilly: bool) -> tuple[list[dict], float]:
    """Turn an ordered list of places into a timed schedule. Returns (blocks, km driven)."""
    blocks: list[dict] = []
    t = 5 * 60 + 15 if order_items and order_items[0]["best_time"] == "sunrise" else 8 * 60 + 30
    prev = base
    lunch_done = False
    total_km = 0.0

    for place in order_items:
        km = km_between(prev, place)
        mins = travel_minutes(km, hilly)
        total_km += km
        t += mins

        if not lunch_done and t >= 12 * 60 + 45 and place["best_time"] != "sunrise":
            blocks.append({"type": "meal", "label": "Lunch break", "start": _fmt(t), "end": _fmt(t + 60)})
            t += 60
            lunch_done = True

        # Sunset and evening stops wait for the right hour; the gap becomes free time (with lunch inside it).
        earliest = {"sunset": 17 * 60, "evening": 18 * 60}.get(place["best_time"], 0)
        if earliest > t:
            lunch_at = 12 * 60 + 30
            if not lunch_done and t <= lunch_at + 30 and earliest >= lunch_at + 60:
                lunch_start = max(t, lunch_at)
                if lunch_start - t >= 30:
                    blocks.append({"type": "free", "label": "Free time: rest or wander nearby", "start": _fmt(t), "end": _fmt(lunch_start)})
                blocks.append({"type": "meal", "label": "Lunch break", "start": _fmt(lunch_start), "end": _fmt(lunch_start + 60)})
                t = lunch_start + 60
                lunch_done = True
            if earliest - t >= 30:
                blocks.append({"type": "free", "label": "Free time: rest or wander nearby", "start": _fmt(t), "end": _fmt(earliest)})
            t = max(t, earliest)

        end = t + int(place["visit_hours"] * 60)
        blocks.append({
            "type": "visit", "start": _fmt(t), "end": _fmt(end), "travel_min": mins, "travel_km": km,
            "place": {k: place[k] for k in ("id", "name", "area", "description", "cost", "visit_hours",
                                             "best_time", "tags", "must_see", "score", "lat", "lng")
                      if k in place} | {"tip": place.get("tip")},
        })
        t = end
        prev = place

    if order_items:
        back = km_between(prev, base)
        total_km += back
        blocks.append({"type": "return", "label": "Head back to your stay", "start": _fmt(t),
                       "end": _fmt(t + travel_minutes(back, hilly)), "travel_km": back})
    return blocks, round(total_km, 1)


def build_days(dest: dict, ranked: list[dict], days: int, pace: str, start: date | None,
               must_include: set[str], skip: set[str]) -> tuple[list[dict], list[dict]]:
    base = {"lat": dest["lat"], "lng": dest["lng"]}
    hilly = dest["vibes"].get("mountains", 0) >= 0.9
    cap = PACE_HOURS.get(pace, 8.0)

    pool = [p for p in ranked if p["id"] not in skip]
    for p in pool:
        p["priority"] = p["score"] + (PINNED_BONUS if p["id"] in must_include else 0)
    pool.sort(key=lambda p: p["priority"], reverse=True)

    # Spread the work over the trip: if there are only a few places, don't cram them into day 1.
    total_hours = sum(p["visit_hours"] + 0.5 for p in pool)
    target = min(cap, max(3.5, total_hours * 1.15 / days))

    scheduled: set[str] = set()
    plan = []
    for d in range(days):
        day_date = start + timedelta(days=d) if start else None
        weekday = WEEKDAYS[day_date.weekday()] if day_date else None
        chosen: list[dict] = []
        used = 0.0
        last = base

        def can_add(p: dict) -> bool:
            if p["id"] in scheduled or (weekday and weekday in p.get("closed_days", [])):
                return False
            # Only one sunrise, one sunset and one evening slot per day.
            if p["best_time"] in ("sunrise", "sunset", "evening") and any(c["best_time"] == p["best_time"] for c in chosen):
                return False
            return True

        while True:
            options = []
            for p in pool:
                if not can_add(p):
                    continue
                mins = travel_minutes(km_between(last, p), hilly)
                need = p["visit_hours"] + mins / 60
                # The first stop of a day may be a long day trip (e.g. Rohtang), so it gets extra room.
                limit = target if chosen else cap + 2.5
                if used + need > limit + 0.25:
                    continue
                # Prefer high-priority places, but penalise long drives so each day stays in one area.
                options.append((p["priority"] - 0.6 * mins, p, need))
            if not options:
                break
            if chosen:
                _, best, need = max(options, key=lambda o: o[0])
            else:
                # Each day starts with the most important place left (no distance penalty),
                # so long day trips like Rohtang still get a day of their own.
                _, best, need = max(options, key=lambda o: o[1]["priority"])
            if chosen and best["id"] not in must_include and best["score"] < 35:
                break  # don't pad days with weak matches
            chosen.append(best)
            scheduled.add(best["id"])
            used += need
            last = best

        # Fixed-time stops go first (sunrise) or last (sunset/evening); the rest keep their nearest-next order.
        fixed = {"sunrise": 0, "sunset": 2, "evening": 3}
        chosen.sort(key=lambda p: fixed.get(p["best_time"], 1))
        blocks, km = _time_block(chosen, base, hilly)
        light_day = sum(p["visit_hours"] for p in chosen) < 3
        plan.append({
            "day": d + 1,
            "date": day_date.isoformat() if day_date else None,
            "weekday": weekday,
            "title": _day_title(chosen),
            "blocks": blocks,
            "visit_hours": round(sum(p["visit_hours"] for p in chosen), 1),
            "km": km,
            "entry_cost_per_person": sum(p["cost"] for p in chosen),
            "free_day": not chosen,
            "free_day_ideas": dest["dont_miss"][:2] + [f"Try {dest['local_food'][d % len(dest['local_food'])]}"]
                              if light_day else [],
        })

    unscheduled = []
    for p in pool:
        if p["id"] in scheduled:
            continue
        if p["id"] in must_include:
            reason = "Didn't fit. Add a day or switch to a faster pace."
            if p.get("closed_days") and start:
                reason = f"Closed on {', '.join(WEEKDAY_NAMES[c] for c in p['closed_days'])} and didn't fit on other days."
            unscheduled.append({"id": p["id"], "name": p["name"], "reason": reason, "pinned": True})
        elif p["score"] >= 45:
            unscheduled.append({"id": p["id"], "name": p["name"], "reason": "Good match, but there wasn't time.", "pinned": False})
    return plan, unscheduled


# ---------- costs ----------

def estimate_costs(dest: dict, plan: list[dict], group_size: int, days: int, tier: str,
                   start: date | None, budget: float) -> dict:
    c = dest["costs"]
    rooms = math.ceil(group_size / 2)
    nights = max(days - 1, 0)
    low, high = c["stay"][tier]
    peak = bool(start and start.month in dest.get("peak_months", []))
    per_night = (low + high) / 2 * (1.25 if peak else 1)

    stay = per_night * rooms * nights
    food = c["food_per_day"][tier] * group_size * days
    vehicles = math.ceil(group_size / 4)
    transport = sum(max(300, d["km"] * c["per_km"]) * vehicles for d in plan if not d["free_day"]) \
        + 300 * vehicles * sum(1 for d in plan if d["free_day"])
    entries = sum(d["entry_cost_per_person"] for d in plan) * group_size
    subtotal = stay + food + transport + entries
    buffer = subtotal * 0.08
    total = subtotal + buffer

    def r(x: float) -> int:
        return int(round(x / 10) * 10)

    return {
        "stay": r(stay), "food": r(food), "local_transport": r(transport), "entry_tickets": r(entries),
        "buffer": r(buffer), "total": r(total), "per_person": r(total / group_size),
        "budget": r(budget), "within_budget": total <= budget, "difference": r(budget - total),
        "rooms": rooms, "nights": nights, "per_night": r(per_night), "vehicles": vehicles,
        "peak_season": peak, "tier": tier,
    }


def build_plan(dest: dict, req: Any) -> dict:
    start = date.fromisoformat(req.start_date) if req.start_date else None
    ranked = scored_places(dest, req.interests, req.budget, req.group_size, req.days)
    plan, unscheduled = build_days(dest, ranked, req.days, req.pace, start,
                                   set(req.must_include), set(req.skip))
    costs = estimate_costs(dest, plan, req.group_size, req.days, req.stay_tier, start, req.budget)

    cheaper = None
    if not costs["within_budget"] and req.stay_tier != "budget":
        alt = estimate_costs(dest, plan, req.group_size, req.days, "budget", start, req.budget)
        cheaper = {"tier": "budget", "total": alt["total"], "within_budget": alt["within_budget"]}

    season_note = None
    if start:
        m = start.month
        if m in dest["best_months"]:
            season_note = "You're going in one of the best months."
        elif m in dest["avoid_months"]:
            season_note = "This is usually a difficult time to visit. Check the weather before booking."
        if costs["peak_season"]:
            season_note = (season_note + " " if season_note else "") + "It's peak season, so stay prices are higher."

    return {
        "destination": {k: dest[k] for k in ("id", "name", "state", "tagline")},
        "request": req.model_dump(),
        "days": plan,
        "unscheduled": unscheduled,
        "costs": costs,
        "cheaper_option": cheaper,
        "hotels": {"tier": req.stay_tier, "price_ranges": c_ranges(dest), "areas": dest["hotel_areas"],
                   "rooms": costs["rooms"], "nights": costs["nights"]},
        "tips": dest["tips"],
        "dont_miss": dest["dont_miss"],
        "local_food": dest["local_food"],
        "getting_there": dest["getting_there"],
        "getting_around": dest["getting_around"],
        "best_months": dest["best_months"],
        "season_note": season_note,
        "method": ("Each place gets a score out of 100: interest match 40, must-see 15, appeal 20, cost fit 15, "
                   "visit effort 10. Days are filled greedily with the best-scoring place that fits, preferring "
                   "nearby stops, then ordered by best time of day."),
    }


def c_ranges(dest: dict) -> dict:
    return {tier: {"low": lo, "high": hi} for tier, (lo, hi) in dest["costs"]["stay"].items()}
