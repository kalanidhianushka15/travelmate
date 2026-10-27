// Shared helpers: API calls, formatting and labels.
import {
  Waves, Snowflake, Mountain, Landmark, Castle, Trees, Tent, UtensilsCrossed,
  Music, ShoppingBag, Coffee,
} from "lucide-react";

// Locally this is the FastAPI dev server. On Vercel, set VITE_API_URL to your Render URL.
export const API = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const IS_LOCAL = API.includes("127.0.0.1") || API.includes("localhost");

// Free Render servers sleep when idle and take up to a minute to wake. If a request is slow,
// App.jsx listens for these events and shows a "waking up" message.
let pending = 0;
let slowTimer = null;
function trackStart() {
  pending += 1;
  if (!slowTimer) slowTimer = setTimeout(() => window.dispatchEvent(new Event("tm-slow")), 4000);
}
function trackEnd() {
  pending = Math.max(0, pending - 1);
  if (pending === 0) {
    clearTimeout(slowTimer); slowTimer = null;
    window.dispatchEvent(new Event("tm-ready"));
  }
}

export async function api(path, options = {}) {
  let response;
  trackStart();
  try {
    response = await fetch(`${API}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error(IS_LOCAL
      ? "Can't reach the TravelMate server. Start the backend (uvicorn) on port 8000 and try again."
      : "Can't reach the TravelMate server right now. Wait a minute and try again.");
  } finally {
    trackEnd();
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(data.detail) ? data.detail.map((d) => d.msg).join(", ") : data.detail;
    throw new Error(detail || `Request failed (${response.status}).`);
  }
  return data;
}

export const money = (n) => "₹" + Math.round(Number(n || 0)).toLocaleString("en-IN");

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];

export const VIBES = [
  { id: "beaches", label: "Beaches", icon: Waves },
  { id: "cold", label: "Cold & snow", icon: Snowflake },
  { id: "mountains", label: "Mountains", icon: Mountain },
  { id: "spiritual", label: "Temples & spiritual", icon: Landmark },
  { id: "heritage", label: "History & forts", icon: Castle },
  { id: "nature", label: "Nature", icon: Trees },
  { id: "adventure", label: "Adventure", icon: Tent },
  { id: "food", label: "Food", icon: UtensilsCrossed },
  { id: "nightlife", label: "Nightlife", icon: Music },
  { id: "shopping", label: "Shopping", icon: ShoppingBag },
  { id: "relaxation", label: "Slow & relaxing", icon: Coffee },
];
export const vibeLabel = (id) => VIBES.find((v) => v.id === id)?.label || id;

export const COST_LEVEL = { 1: "Easy on the wallet", 2: "Mid-range", 3: "On the pricier side" };
export const TIERS = [
  { id: "budget", label: "Budget", hint: "Hostels, guesthouses" },
  { id: "mid", label: "Comfort", hint: "3-star hotels, good homestays" },
  { id: "premium", label: "Premium", hint: "Resorts, heritage hotels" },
];
export const PACES = [
  { id: "relaxed", label: "Relaxed", hint: "About 6 hours a day" },
  { id: "balanced", label: "Balanced", hint: "About 8 hours a day" },
  { id: "packed", label: "Packed", hint: "About 10 hours a day" },
];
export const BEST_TIME = {
  sunrise: "Go at sunrise", morning: "Best in the morning", afternoon: "Afternoon",
  sunset: "Go for sunset", evening: "Evening", any: "Any time",
};

export function monthRange(months) {
  // [10,11,12,1,2] -> "Oct–Feb"
  const set = new Set(months || []);
  if (set.size === 0 || set.size === 12) return "All year";
  const next = (m) => (m === 12 ? 1 : m + 1);
  const prev = (m) => (m === 1 ? 12 : m - 1);
  const starts = [...set].filter((m) => !set.has(prev(m))).sort((a, b) => a - b);
  return starts.map((s) => {
    let end = s;
    while (set.has(next(end))) end = next(end);
    return s === end ? MONTHS[s - 1] : `${MONTHS[s - 1]}–${MONTHS[end - 1]}`;
  }).join(", ");
}
