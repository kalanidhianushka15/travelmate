"""Run with:  pytest -q   (from the backend folder, with the venv active)"""
from fastapi.testclient import TestClient

from app.main import app
from app.suggester import parse_text

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_text_is_understood():
    parsed = parse_text("a cold place with temples in December, low budget")
    assert "cold" in parsed["vibes"] and "spiritual" in parsed["vibes"]
    assert parsed["month"] == 12 and parsed["budget_level"] == 1


def test_suggest_beaches_puts_goa_or_pondicherry_first():
    r = client.post("/api/suggest", json={"vibes": ["beaches"], "month": 12})
    assert r.status_code == 200
    assert r.json()["results"][0]["id"] in {"goa", "pondicherry"}


def test_suggest_cold_mountains():
    top = client.post("/api/suggest", json={"text": "snow and mountains"}).json()["results"][0]["id"]
    assert top in {"manali", "darjeeling"}


def test_suggest_needs_input():
    assert client.post("/api/suggest", json={}).status_code == 400


def test_destination_detail_has_places():
    r = client.get("/api/destinations/jaipur?interests=heritage")
    assert r.status_code == 200
    places = r.json()["places"]
    assert len(places) >= 8 and places[0]["score"] >= places[-1]["score"]


def test_generate_plan():
    body = {"destination": "jaipur", "days": 2, "group_size": 2, "budget": 20000,
            "interests": ["heritage", "shopping"], "pace": "balanced", "stay_tier": "mid"}
    r = client.post("/api/generate", json=body)
    assert r.status_code == 200
    plan = r.json()
    assert len(plan["days"]) == 2
    visits = [b for d in plan["days"] for b in d["blocks"] if b["type"] == "visit"]
    assert len(visits) >= 4
    assert plan["costs"]["total"] > 0 and plan["hotels"]["areas"] and plan["tips"]


def test_must_include_and_skip():
    body = {"destination": "manali", "days": 3, "group_size": 2, "budget": 30000, "interests": ["cold"],
            "must_include": ["man-naggar"], "skip": ["man-solang"]}
    plan = client.post("/api/generate", json=body).json()
    ids = [b["place"]["id"] for d in plan["days"] for b in d["blocks"] if b["type"] == "visit"]
    assert "man-naggar" in ids and "man-solang" not in ids


def test_closed_day_is_respected():
    # 2026-10-23 is a Friday: Chowmahalla and Salar Jung are closed on Fridays.
    body = {"destination": "hyderabad", "days": 1, "group_size": 1, "budget": 10000,
            "interests": ["heritage"], "start_date": "2026-10-23"}
    plan = client.post("/api/generate", json=body).json()
    ids = [b["place"]["id"] for b in plan["days"][0]["blocks"] if b["type"] == "visit"]
    assert "hyd-chowmahalla" not in ids and "hyd-salarjung" not in ids


def test_unknown_destination():
    body = {"destination": "atlantis", "days": 2, "group_size": 2, "budget": 10000}
    assert client.post("/api/generate", json=body).status_code == 404


def test_save_and_delete_trip():
    saved = client.post("/api/trips", json={"destination": {"name": "Goa"}, "days": [1]}).json()
    assert client.delete(f"/api/trips/{saved['id']}").status_code == 200


def test_origins_list():
    names = [o["name"] for o in client.get("/api/origins").json()]
    assert "Hyderabad" in names and "Delhi" in names


def test_travel_options_hyderabad_to_goa():
    r = client.post("/api/travel-options", json={"origin": "hyderabad", "destination": "goa", "travellers": 2, "date": "2026-12-20"})
    assert r.status_code == 200
    data = r.json()
    modes = {o["mode"]: o for o in data["options"]}
    assert modes["flight"]["available"] and modes["train"]["available"] and modes["bus"]["available"]
    assert "GOI" in modes["flight"]["links"][0]["url"] and "2026-12-20" in modes["flight"]["links"][0]["url"]
    assert modes["train"]["round_trip_group_low"] == modes["train"]["fare_low"] * 4


def test_manali_has_no_train():
    data = client.post("/api/travel-options", json={"origin": "delhi", "destination": "manali"}).json()
    train = next(o for o in data["options"] if o["mode"] == "train")
    assert train["available"] is False and "Chandigarh" in train["note"]


def test_same_city():
    data = client.post("/api/travel-options", json={"origin": "hyderabad", "destination": "hyderabad"}).json()
    assert data["same_city"] is True


def test_update_trip_keeps_id_and_saves_bookings():
    saved = client.post("/api/trips", json={"destination": {"id": "goa", "name": "Goa"}, "days": [1]}).json()
    body = {**saved, "travel": {"origin": "hyderabad", "bookings": {"train": {"ref": "1234567890"}}}}
    updated = client.put(f"/api/trips/{saved['id']}", json=body).json()
    assert updated["id"] == saved["id"] and updated["created_at"] == saved["created_at"]
    assert updated["travel"]["bookings"]["train"]["ref"] == "1234567890"
    # comes back from the database on a fresh read too
    again = next(t for t in client.get("/api/trips").json() if t["id"] == saved["id"])
    assert again["travel"]["bookings"]["train"]["ref"] == "1234567890" and again["travel"]["origin"] == "hyderabad"
    # removing the booking removes the row
    body["travel"]["bookings"] = {}
    assert client.put(f"/api/trips/{saved['id']}", json=body).json()["travel"]["bookings"] == {}
    assert client.delete(f"/api/trips/{saved['id']}").status_code == 200


def test_full_generated_plan_round_trip():
    plan = client.post("/api/generate", json={"destination": "udaipur", "days": 2, "group_size": 3, "budget": 30000}).json()
    saved = client.post("/api/trips", json=plan).json()
    fetched = next(t for t in client.get("/api/trips").json() if t["id"] == saved["id"])
    assert fetched["costs"]["total"] == plan["costs"]["total"] and len(fetched["days"]) == 2
    client.delete(f"/api/trips/{saved['id']}")


def test_health_reports_sql():
    assert client.get("/api/health").json()["database"] in {"mysql", "sqlite"}
