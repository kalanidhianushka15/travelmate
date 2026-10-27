# TravelMate: MySQL setup and free deployment

```
 Browser ──► Vercel (React frontend) ──► Render (FastAPI backend) ──► Aiven (MySQL database)
```

All three have free plans and none needs a credit card. Things to know about the free plans:
- **Render** puts the backend to sleep after 15 minutes with no visitors. The next visit takes about a
  minute to wake it, and the app shows a "Starting the server" message while it does.
- **Aiven** may power off a free database that isn't used. It emails you first, and you can turn it
  back on from the console with one click.

Do the parts in order. Part A is local only, Parts B–E put the app online.

---

## Part A: Use MySQL on your own laptop

1. Install **MySQL Community Server** and **MySQL Workbench** (https://dev.mysql.com/downloads/installer/).
   Remember the root password you set.
2. Open MySQL Workbench → connect to *Local instance* → run:
   ```sql
   CREATE DATABASE travelmate;
   ```
3. Open `backend\.env` and set (use your real password):
   ```
   DATABASE_URL=mysql+pymysql://root:YOUR_PASSWORD@localhost:3306/travelmate
   DB_SSL=
   ```
   If your password has `@`, `#` or `/` in it, write them as `%40`, `%23`, `%2F`.
4. In the backend terminal:
   ```bat
   .venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --reload-dir app
   ```
   You'll see `Loaded 12 destinations into the database.` The tables are created automatically.
5. Check http://127.0.0.1:8000/api/health. It should say `"database":"mysql"`.
6. In Workbench, refresh *Schemas* → `travelmate` → *Tables*. You'll see `destinations`, `attractions`,
   `hotel_areas`, `destination_notes`, `trips`, `bookings`.

---

## Part B: Put the code on GitHub

1. Create a new **empty** repository on github.com called `travelmate`. Don't add a README.
2. In VS Code, open a terminal in the main `TravelMate` folder (the one that contains `backend` and `frontend`):
   ```bat
   git init
   git add .
   git commit -m "TravelMate with MySQL"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/travelmate.git
   git push -u origin main
   ```
3. On GitHub, check that **`.env` is NOT there**. The `.gitignore` file keeps it out, because it has
   your password in it. `node_modules` and `.venv` should not be there either.

---

## Part C: Create the online MySQL database (Aiven)

1. Sign up at https://console.aiven.io/signup.
2. **Create service** → **MySQL** → choose the **Free** plan → **Create service**.
   Wait until the status shows **Running** (a few minutes).
3. On the service *Overview* page, copy the **Service URI**. It looks like
   `mysql://avnadmin:PASSWORD@mysql-xxxx.aivencloud.com:12345/defaultdb?ssl-mode=REQUIRED`
   Keep it private.
4. Optional, to test it from your laptop: put that URI in `backend\.env` as `DATABASE_URL=...` with
   `DB_SSL=true`, run uvicorn, and check `/api/health`. Afterwards switch back to your local URL.

---

## Part D: Deploy the backend (Render)

1. Sign up at https://render.com with your GitHub account.
2. **New +** → **Web Service** → pick your `travelmate` repo.
3. Fill in:
   | Setting | Value |
   |---|---|
   | Root Directory | `backend` |
   | Runtime | Python 3 |
   | Build Command | `pip install -r requirements.txt` |
   | Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
   | Instance Type | **Free** |
4. **Environment Variables** → add:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | the Aiven Service URI from Part C |
   | `DB_SSL` | `true` |
   | `PYTHON_VERSION` | `3.12.7` |
5. **Create Web Service**. The first build takes 3–5 minutes. When it says **Live**, copy your URL,
   e.g. `https://travelmate-api.onrender.com`.
6. Open `https://YOUR-RENDER-URL/api/health`. You should see `"status":"ok","database":"mysql","destinations":12`.

(The repo also contains `render.yaml`. If you prefer, use **New + → Blueprint** and Render fills
these settings in for you. It will still ask you for `DATABASE_URL`.)

---

## Part E: Deploy the frontend (Vercel)

1. Go to https://vercel.com → **Add New… → Project** → import your `travelmate` repo.
2. Set **Root Directory** to `frontend`. The framework should be detected as **Vite**.
3. **Environment Variables** → add
   `VITE_API_URL` = your Render URL from Part D (no `/` at the end).
4. **Deploy**. You'll get a link like `https://travelmate-xyz.vercel.app`. That's your live app.
5. Back in **Render → your service → Environment**, add
   `FRONTEND_ORIGINS` = your Vercel link, then save. Render redeploys automatically.
   (Links ending in `.vercel.app` already work, but if you add a custom domain later it must be listed here.)

---

## Updating the live app later

Make your changes, then:
```bat
git add .
git commit -m "describe the change"
git push
```
Vercel and Render both rebuild automatically from GitHub.

If you change `backend/app/data/destinations.json`, open `https://YOUR-RENDER-URL/docs`, run
**POST /api/admin/reseed** to reload it into MySQL. Saved trips are kept.

---

## If something goes wrong

| Problem | What it means / fix |
|---|---|
| Render log: `Access denied for user` | Wrong password in `DATABASE_URL`. Copy the Service URI again from Aiven. |
| Render log: `Can't connect to MySQL server` | Aiven service is powered off or still starting. Turn it on in the Aiven console. |
| Render log: SSL / certificate error | Make sure `DB_SSL` is `true`. |
| Site loads but says "Can't reach the TravelMate server" | `VITE_API_URL` on Vercel is wrong or missing. Fix it, then **Redeploy** on Vercel (env changes need a new build). |
| Browser console shows a **CORS** error | Add your exact Vercel link to `FRONTEND_ORIGINS` on Render. |
| First load takes ~1 minute | Normal on the free plan. Render was asleep. |
| Local: `Access denied for user 'root'@'localhost'` | Wrong MySQL password in `backend\.env`. |
| Local: `Unknown database 'travelmate'` | Run `CREATE DATABASE travelmate;` in Workbench. |
