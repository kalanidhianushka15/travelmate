# TravelMate v2: Personalized Travel Planning

React + Tailwind CSS (frontend), FastAPI + Python (backend), MySQL (database, via SQLAlchemy).

**To put it online (Vercel + Render + Aiven MySQL), follow [DEPLOY.md](DEPLOY.md).**
The recommendations come from a rule-based scoring algorithm. No paid AI APIs and no pretrained models.

## What the app does

1. **Two ways to start**
   - *I know where I'm going*: pick one of 12 destinations.
   - *Help me choose*: tap vibes (beaches, cold & snow, temples, food…) and/or type what you want,
     e.g. "somewhere cold with temples in December, low budget". The backend reads the keywords,
     scores every destination out of 100 and suggests the best matches.
2. **Destination page**: every tourist place, scored for you. Tap a place to mark it *must go*, tap again
   to *skip* it. Choose days, travellers, budget, stay type, pace and an optional start date.
3. **Your plan**: a day-by-day itinerary with times and travel between stops, plus an expense breakdown,
   where to stay (areas + price range), tips & rules, don't-miss list, food to try and getting around.
4. **Book tickets**: choose your starting city and travel date to compare flight, train and bus:
   door-to-door time, estimated fare per person, which airport or station to use, and the last stretch to
   the destination. Each option opens the official booking site (Google Flights already filled in, IRCTC,
   redBus). After booking, save your PNR or booking reference with the trip. "Add to budget" adds the
   round-trip estimate to your total.
   TravelMate does not take payments or issue tickets. Real booking needs IRCTC agent access or paid
   airline/bus APIs, so it hands you over to the official sites instead.
5. **Saved trips**: save, reopen and delete plans, including booking references (stored in MySQL).

## Run it (Windows, VS Code terminal)

### Backend: terminal 1
```bat
cd backend
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --reload-dir app
```
API: http://127.0.0.1:8000. Interactive docs: http://127.0.0.1:8000/docs

If you already have a `.venv` from v1, just activate it and run `pip install -r requirements.txt` again.

### Frontend: terminal 2
```bat
cd frontend
npm install
npm run dev
```
Open http://localhost:5173

### Tests (optional)
```bat
cd backend
.venv\Scripts\activate
pytest -q
```

## Database (MySQL)
Set `DATABASE_URL` in `backend/.env`:
```
DATABASE_URL=mysql+pymysql://root:YOUR_PASSWORD@localhost:3306/travelmate
```
Create the empty database first in MySQL Workbench (`CREATE DATABASE travelmate;`). On startup the
backend creates the tables and loads `backend/app/data/destinations.json` into them.
If `DATABASE_URL` is empty, a local SQLite file (`backend/travelmate.db`) is used instead, which is handy for
a quick test without MySQL. Full steps: [DEPLOY.md](DEPLOY.md), Part A.

**Tables**
| Table | What it holds | Key columns |
|---|---|---|
| destinations | One row per city | id (PK), name, state, lat, lng, cost_level, best_months (JSON), costs (JSON) |
| attractions | Tourist places | id (PK), destination_id (FK), name, area, cost, visit_hours, best_time, must_see |
| hotel_areas | Where to stay | id, destination_id (FK), area, best_for, note |
| destination_notes | Tips, don't-miss list, local food | id, destination_id (FK), kind, text |
| trips | Saved plans | id (PK, uuid), destination_id, days, group_size, total_cost, created_at, plan (JSON) |
| bookings | PNR / booking references | id, trip_id (FK → trips, cascade delete), mode, ref, saved_at |

## The algorithms (for your report / viva)

**Destination suggestion (out of 100)**, in `app/suggester.py`
| Part | Points | How |
|---|---|---|
| Vibe match | 55 | Average strength (0–1) of each chosen vibe at that destination |
| Season fit | 25 | 25 if the month is a best month, 12 if neutral, 0 if it's a month to avoid |
| Budget fit | 20 | 20 if the cost level matches, 10 if one level off, 0 otherwise |

Free text is turned into vibes, a month and a budget level using a keyword dictionary
(e.g. "snow" → cold, "temple" → spiritual, "cheap" → budget).

**Place score (out of 100)**, in `app/planner.py`
| Part | Points |
|---|---|
| Interest match | 40 |
| Must-see place | 15 |
| Appeal (editorial 1–5 weight in the dataset) | 20 |
| Cost fit vs. your daily budget per person | 15 |
| Visit effort (shorter visits are easier to fit) | 10 |

**Day planning**
1. Places you marked *must go* get +200 priority; *skipped* places are removed.
2. Each day starts with the most important place left, then keeps adding the best place
   that fits, with a penalty for travel time so each day stays in one area.
3. Daily limit depends on pace (6 / 8 / 10 hours). Travel time is estimated from the distance
   between coordinates (haversine × 1.3 for real roads, slower speeds in hills).
4. Only one sunrise, one sunset and one evening stop per day. If you set a start date,
   places closed on that weekday are moved to another day.
5. Times are worked out stop by stop, with a lunch break and free time before sunset/evening stops.

**Travel estimates** (`app/transport.py`), one way per person:
| Mode | When shown | Fare rule | Time rule |
|---|---|---|---|
| Flight | over 350 km | 2,500 + 3.2 per km (range 0.75x to 1.5x) | 2 hr airport + flying at ~700 km/h + airport to city |
| Train | destination has a railhead | Sleeper ~0.45/km to 3AC ~1.3/km | ~55 km/h + station to city |
| Bus | up to 1,200 km | Seater ~1.3/km to AC sleeper ~2.6/km | ~45 km/h |

Road/rail distance = straight-line × 1.25. Starting cities are in `app/data/origins.json`.

**Expenses**: stay (rooms = travellers ÷ 2, nights = days − 1, +25% in peak season) + food per person per day
+ local transport (km per day × rate per km) + entry tickets + 8% buffer.

## Important: data accuracy
Prices, timings and closing days in `destinations.json` are planning estimates collected for this
project. They change often. The app says so on screen. Verify them before a real trip, and update the JSON
when you find newer numbers.

## Project structure
```
TravelMate/
  backend/
    app/main.py            API routes
    app/planner.py         place scoring, day planning, costs
    app/suggester.py       vibe/text parsing and destination suggestions
    app/models.py          MySQL tables (SQLAlchemy models)
    app/storage.py         database connection, seeding, saved trips
    app/transport.py       flight/train/bus estimates and booking links
    app/data/origins.json  starting cities
    app/data/destinations.json   12 destinations, ~117 places
    tests/test_api.py
  frontend/src/
    App.jsx                steps + navigation
    lib.js                 API helper, labels, formatting
    components/StartStep.jsx        step 1: the two options
    components/DestinationStep.jsx  step 2: places + trip settings
    components/PlanStep.jsx         step 3: itinerary, expenses, stays, tips
    components/BookTickets.jsx      flight/train/bus comparison + booking references
    components/SavedTrips.jsx
    components/ui.jsx               small shared pieces
```

## API endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | /api/health | Status and database mode |
| GET | /api/vibes | Vibe list |
| GET | /api/destinations | All destinations (summary) |
| GET | /api/destinations/{id}?interests=&budget=&group_size=&days= | Destination + scored places |
| GET | /api/attractions?destination= | Raw places (kept from v1) |
| POST | /api/suggest | Suggest destinations from vibes/text |
| POST | /api/generate | Build the itinerary |
| GET | /api/origins | Starting cities for Book tickets |
| POST | /api/travel-options | Flight / train / bus options and booking links |
| GET/POST | /api/trips | List / save trips |
| PUT | /api/trips/{id} | Update a saved trip (e.g. booking references) |
| DELETE | /api/trips/{id} | Delete a trip |
| POST | /api/admin/reseed | Reload destinations.json into MySQL |

## Adding a new destination
Copy one destination block in `destinations.json`, change the values, and give every place real
`lat`/`lng` coordinates (right-click a spot in Google Maps to copy them). Restart the backend.
