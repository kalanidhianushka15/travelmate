// "Book tickets": compare flight / train / bus from your city, open the official booking site,
// then save your PNR / booking reference with the trip. TravelMate never takes payment itself.
import { useEffect, useState } from "react";
import { Plane, TrainFront, Bus, ExternalLink, Copy, Check, Ticket, Loader2, X } from "lucide-react";
import { api, money } from "../lib.js";
import { Notice } from "./ui.jsx";

const MODES = {
  flight: { label: "Flight", icon: Plane },
  train: { label: "Train", icon: TrainFront },
  bus: { label: "Bus", icon: Bus },
};

export default function BookTickets({ plan, onChange }) {
  const travel = plan.travel || {};
  const [origins, setOrigins] = useState([]);
  const [origin, setOrigin] = useState(travel.origin || "");
  const [date, setDate] = useState(travel.date || plan.request.start_date || "");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { api("/api/origins").then(setOrigins).catch((e) => setError(e.message)); }, []);

  // Fetch options whenever the starting city or date changes.
  useEffect(() => {
    if (!origin) { setResult(null); return; }
    let alive = true;
    setLoading(true); setError("");
    api("/api/travel-options", {
      method: "POST",
      body: { origin, destination: plan.destination.id, travellers: plan.request.group_size, date: date || null },
    })
      .then((r) => alive && setResult(r))
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [origin, date, plan.destination.id, plan.request.group_size]);

  const originName = (id) => origins.find((o) => o.id === id)?.name;

  function update(patch) {
    onChange({ ...plan, travel: { ...travel, origin, origin_name: originName(origin), date, ...patch } });
  }

  function chooseForBudget(option) {
    if (travel.budget_mode === option.mode) update({ budget_mode: null, budget_amount: 0 });
    else update({ budget_mode: option.mode, budget_amount: option.round_trip_group_estimate });
  }

  function saveBooking(mode, ref) {
    const bookings = { ...(travel.bookings || {}) };
    if (ref) bookings[mode] = { ref, saved_at: new Date().toISOString() };
    else delete bookings[mode];
    update({ bookings });
  }

  const people = plan.request.group_size;
  const options = result?.options || [];

  return (
    <section className="rounded-2xl border border-line bg-white p-5 md:p-6" aria-labelledby="book-tickets">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="book-tickets" className="flex items-center gap-2 text-2xl font-bold text-ink"><Ticket size={22} className="text-marigold" />Book tickets</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">Compare ways to reach {plan.destination.name}, then book on the official site. Paste your PNR or booking reference here to keep it with the trip.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-bold">From</span>
            <select value={origin} onChange={(e) => { setOrigin(e.target.value); onChange({ ...plan, travel: { ...travel, origin: e.target.value, origin_name: originName(e.target.value), date, budget_mode: null, budget_amount: 0 } }); }}
              className="w-48 rounded-lg border border-line bg-white p-2.5">
              <option value="">Choose your city</option>
              {origins.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Travel date</span>
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); update({ date: e.target.value }); }}
              className="rounded-lg border border-line bg-white p-2.5" />
          </label>
        </div>
      </div>

      <div className="mt-5" aria-live="polite">
        <Notice>{error}</Notice>
        {!origin && <p className="rounded-lg bg-paper p-4 text-sm text-muted">Pick the city you're starting from to see flights, trains and buses.</p>}
        {loading && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 size={16} className="animate-spin" /> Checking routes</p>}
        {result?.same_city && <p className="rounded-lg bg-paper p-4 text-sm">You're already in {result.destination}, so there's nothing to book.</p>}

        {!loading && options.length > 0 && (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              {options.map((o) => (
                <ModeCard key={o.mode} option={o} people={people}
                  isCheapest={result.cheapest === o.mode} isFastest={result.fastest === o.mode}
                  inBudget={travel.budget_mode === o.mode} onBudget={() => chooseForBudget(o)}
                  booking={travel.bookings?.[o.mode]} onSaveBooking={(ref) => saveBooking(o.mode, ref)}
                  summary={`${result.origin} to ${result.destination}${date ? ` on ${new Date(date + "T00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : ""}, ${people} ${people === 1 ? "traveller" : "travellers"}`} />
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">{result.disclaimer} Fares shown are one way, per person. About {result.distance_km} km by road.</p>
          </>
        )}
      </div>
    </section>
  );
}

function ModeCard({ option: o, people, isCheapest, isFastest, inBudget, onBudget, booking, onSaveBooking, summary }) {
  const { label, icon: Icon } = MODES[o.mode];
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [ref, setRef] = useState(booking?.ref || "");

  if (!o.available) {
    return (
      <div className="rounded-xl border border-dashed border-line p-4">
        <p className="flex items-center gap-2 font-bold text-muted"><Icon size={18} />{label}</p>
        <p className="mt-2 text-sm text-muted">{o.note}</p>
      </div>
    );
  }

  const details = `${summary}. ${label}: ${o.from_point} to ${o.to_point}.`;
  async function copy() {
    try { await navigator.clipboard.writeText(details); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard blocked */ }
  }

  return (
    <div className={`flex flex-col rounded-xl border p-4 ${booking ? "border-teal" : inBudget ? "border-ink" : "border-line"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-display text-lg font-bold text-ink"><Icon size={19} />{label}</p>
        <span className="flex gap-1">
          {isCheapest && <span className="rounded-full bg-teal-soft px-2 py-0.5 text-[11px] font-bold text-teal">Cheapest</span>}
          {isFastest && <span className="rounded-full bg-marigold-soft px-2 py-0.5 text-[11px] font-bold text-ink">Fastest</span>}
        </span>
      </div>
      <p className="mt-2 text-sm"><b>{o.duration}</b> door to door</p>
      <p className="text-sm"><b className="tabular-nums">{money(o.fare_low)}–{money(o.fare_high)}</b> per person{o.fare_note && <span className="text-muted"> ({o.fare_note})</span>}</p>
      <p className="mt-2 text-xs text-muted">{o.from_point} → {o.to_point}</p>
      <p className="text-xs text-muted">{o.last_mile}</p>
      <p className="mt-2 text-xs">{o.note}</p>

      <div className="mt-auto space-y-2 pt-4">
        {o.links.map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-lg bg-ink px-3 py-2.5 text-sm font-bold text-white hover:bg-ink-soft">
            {l.label} <ExternalLink size={14} />
          </a>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={copy} className="flex items-center justify-center gap-1.5 rounded-lg border border-line px-2 py-2 text-xs font-bold hover:border-ink">
            {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy details</>}
          </button>
          <button onClick={onBudget} aria-pressed={inBudget}
            className={`rounded-lg border px-2 py-2 text-xs font-bold ${inBudget ? "border-ink bg-ink text-white" : "border-line hover:border-ink"}`}>
            {inBudget ? "In budget" : "Add to budget"}
          </button>
        </div>
        <p className="text-center text-[11px] text-muted">Round trip for {people}: about {money(o.round_trip_group_estimate)}</p>

        {booking && !editing ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-teal-soft px-3 py-2 text-sm">
            <span className="text-teal"><b>Booked</b> · {booking.ref}</span>
            <span className="flex gap-1">
              <button onClick={() => { setRef(booking.ref); setEditing(true); }} className="text-xs font-bold text-teal underline">Edit</button>
              <button aria-label="Remove booking" onClick={() => { onSaveBooking(""); setRef(""); }} className="text-teal"><X size={14} /></button>
            </span>
          </div>
        ) : editing ? (
          <form onSubmit={(e) => { e.preventDefault(); onSaveBooking(ref.trim()); setEditing(false); }} className="flex gap-1.5">
            <input autoFocus value={ref} onChange={(e) => setRef(e.target.value)} maxLength={40}
              placeholder={o.mode === "train" ? "10-digit PNR" : "Booking reference"} aria-label="Booking reference"
              className="min-w-0 flex-1 rounded-lg border border-line px-2.5 py-2 text-sm outline-none focus:border-ink" />
            <button disabled={!ref.trim()} className="rounded-lg bg-teal px-3 text-sm font-bold text-white disabled:opacity-40">Save</button>
          </form>
        ) : (
          <button onClick={() => setEditing(true)} className="w-full rounded-lg border border-dashed border-line py-2 text-xs font-bold text-muted hover:border-teal hover:text-teal">
            I've booked this. Add my PNR or reference
          </button>
        )}
      </div>
    </div>
  );
}
