"""Option 2: "Tell me what you want and suggest a place".

1. parse_text() turns a free-text wish like "cold place with temples in december, low budget"
   into vibes + month + budget level using a keyword dictionary (no AI model involved).
2. suggest() scores every destination out of 100:
     vibe match    55  - average strength of the chosen vibes at that destination
     season fit    25  - is the travel month a good month there?
     budget fit    20  - how close is the destination's cost level to the user's budget level?
"""
import re
from typing import Any

VIBES = {
    "beaches":   {"label": "Beaches",          "words": ["beach", "beaches", "sea", "ocean", "coast", "coastal", "sand", "surf", "island"]},
    "cold":      {"label": "Cold & snow",      "words": ["cold", "snow", "snowy", "chilly", "freezing", "winter wonderland", "sweater", "jacket weather", "cool weather"]},
    "mountains": {"label": "Mountains",        "words": ["mountain", "mountains", "hill", "hills", "hill station", "valley", "peak", "himalaya", "himalayas"]},
    "spiritual": {"label": "Temples & spiritual", "words": ["temple", "temples", "spiritual", "pilgrimage", "god", "ghat", "ghats", "ashram", "monastery", "aarti", "church", "churches", "yoga", "divine", "holy"]},
    "heritage":  {"label": "History & forts",  "words": ["history", "historic", "historical", "fort", "forts", "palace", "palaces", "heritage", "monument", "monuments", "ruins", "architecture", "royal", "museum"]},
    "nature":    {"label": "Nature & greenery", "words": ["nature", "green", "greenery", "waterfall", "waterfalls", "forest", "tea", "garden", "scenic", "wildlife", "lake", "lakes"]},
    "adventure": {"label": "Adventure",        "words": ["adventure", "rafting", "paragliding", "trek", "trekking", "hike", "hiking", "thrill", "camping", "skiing", "surfing"]},
    "food":      {"label": "Food",             "words": ["food", "foodie", "eat", "eating", "cuisine", "biryani", "street food", "cafe", "cafes"]},
    "nightlife": {"label": "Nightlife",        "words": ["party", "parties", "nightlife", "club", "clubs", "pub", "pubs", "bar", "bars"]},
    "shopping":  {"label": "Shopping",         "words": ["shopping", "shop", "market", "markets", "bazaar", "bazaars"]},
    "relaxation": {"label": "Slow & relaxing", "words": ["relax", "relaxing", "calm", "quiet", "peaceful", "peace", "slow", "rest", "chill", "lazy", "unwind"]},
}

MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3, "apr": 4, "april": 4,
    "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7, "aug": 8, "august": 8, "sep": 9, "sept": 9,
    "september": 9, "oct": 10, "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}
MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August",
               "September", "October", "November", "December"]
BUDGET_WORDS = {
    1: ["cheap", "budget", "low budget", "affordable", "low cost", "student", "backpacking"],
    3: ["luxury", "premium", "lavish", "splurge", "fancy"],
}


def _has_phrase(text: str, phrase: str) -> bool:
    return re.search(r"\b" + re.escape(phrase) + r"\b", text) is not None


def parse_text(text: str) -> dict[str, Any]:
    """Return {'vibes': [...], 'month': int|None, 'budget_level': int|None, 'matched': [...]}"""
    text = (text or "").lower()
    found_vibes, matched = [], []
    for key, meta in VIBES.items():
        hits = [w for w in meta["words"] if _has_phrase(text, w)]
        if hits:
            found_vibes.append(key)
            matched.append(f"{hits[0]} → {meta['label']}")

    month = None
    for word, number in MONTHS.items():
        # "may" is also an ordinary word, so only count it next to "in"/"during"
        if word == "may" and not re.search(r"\b(in|during|this|next)\s+may\b", text):
            continue
        if _has_phrase(text, word):
            month = number
            matched.append(f"{word} → {MONTH_NAMES[number]}")
            break

    budget_level = None
    for level, words in BUDGET_WORDS.items():
        hit = next((w for w in words if _has_phrase(text, w)), None)
        if hit:
            budget_level = level
            matched.append(f"{hit} → {'budget-friendly' if level == 1 else 'premium'}")
            break

    return {"vibes": found_vibes, "month": month, "budget_level": budget_level, "matched": matched}


def score_destination(dest: dict, vibes: list[str], month: int | None, budget_level: int | None) -> dict:
    strengths = [dest["vibes"].get(v, 0) for v in vibes]
    vibe_points = round(55 * sum(strengths) / len(strengths)) if strengths else 25

    if month is None:
        season_points, season_note = 15, None
    elif month in dest["best_months"]:
        season_points, season_note = 25, f"Great in {MONTH_NAMES[month]}"
    elif month in dest["avoid_months"]:
        season_points, season_note = 0, f"Not ideal in {MONTH_NAMES[month]}"
    else:
        season_points, season_note = 12, f"Okay in {MONTH_NAMES[month]}"

    if budget_level is None:
        budget_points = 12
    else:
        budget_points = {0: 20, 1: 10}.get(abs(dest["cost_level"] - budget_level), 0)

    strong = [VIBES[v]["label"] for v in vibes if dest["vibes"].get(v, 0) >= 0.7]
    weak = [VIBES[v]["label"] for v in vibes if dest["vibes"].get(v, 0) < 0.3]
    reasons = []
    if strong:
        reasons.append("Strong for " + ", ".join(strong).lower())
    if season_note:
        reasons.append(season_note)
    if weak:
        reasons.append("Not much for " + ", ".join(weak).lower())

    return {
        "score": vibe_points + season_points + budget_points,
        "breakdown": {"vibe": vibe_points, "season": season_points, "budget": budget_points},
        "reasons": reasons,
    }


def suggest(destinations: list[dict], vibes: list[str], text: str, month: int | None,
            budget_level: int | None, limit: int = 6) -> dict:
    parsed = parse_text(text)
    all_vibes = list(dict.fromkeys([v for v in vibes if v in VIBES] + parsed["vibes"]))
    month = month or parsed["month"]
    budget_level = budget_level or parsed["budget_level"]

    results = []
    for dest in destinations:
        s = score_destination(dest, all_vibes, month, budget_level)
        results.append({
            "id": dest["id"], "name": dest["name"], "state": dest["state"], "tagline": dest["tagline"],
            "cost_level": dest["cost_level"], "ideal_days": dest["ideal_days"], **s,
        })
    results.sort(key=lambda r: r["score"], reverse=True)
    return {
        "understood": {"vibes": all_vibes, "month": month, "budget_level": budget_level, "matched": parsed["matched"]},
        "results": results[:limit],
    }
