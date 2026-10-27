// Step 3: the itinerary, expenses, where to stay, tips, and what not to miss.
import { useState } from "react";
import {
  ArrowLeft, Bookmark, Wallet, BedDouble, ShieldAlert, Star, UtensilsCrossed, Bus, Car, Coffee,
  Home, Sun, Info, Printer, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { money, TIERS, PACES, monthRange } from "../lib.js";
import { Notice, Section } from "./ui.jsx";
import BookTickets from "./BookTickets.jsx";

export default function PlanStep({ plan, onBack, onSave, saved, onChange }) {
  const { destination, request } = plan;
  const travelAmount = plan.travel?.budget_amount || 0;
  const costs = withTravel(plan.costs, travelAmount, request.group_size);
  const tierLabel = TIERS.find((t) => t.id === request.stay_tier)?.label;
  const paceLabel = PACES.find((p) => p.id === request.pace)?.label;
  const placeCount = plan.days.reduce((n, d) => n + d.blocks.filter((b) => b.type === "visit").length, 0);

  return (
    <div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink">
          <ArrowLeft size={16} /> Change places or settings
        </button>
        <div className="flex gap-2">
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3.5 py-2 text-sm font-bold hover:border-ink">
            <Printer size={15} /> Print
          </button>
          <button onClick={onSave} disabled={saved} className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-bold text-white hover:bg-ink-soft disabled:opacity-60">
            <Bookmark size={15} /> {saved ? "Saved" : "Save trip"}
          </button>
        </div>
      </div>

      <header className="rounded-2xl bg-ink p-6 text-white md:p-8">
        <h1 className="text-4xl font-extrabold md:text-5xl">{request.days} days in {destination.name}</h1>
        <p className="mt-2 text-white/80">
          {request.group_size} {request.group_size === 1 ? "traveller" : "travellers"}, {placeCount} places, {paceLabel.toLowerCase()} pace, {tierLabel.toLowerCase()} stays
          {request.start_date && <> , from {new Date(request.start_date + "T00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long" })}</>}
        </p>
        <div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <p className="text-sm text-white/70">{travelAmount ? "Estimated total with travel" : "Estimated total"}</p>
            <p className="font-display text-4xl font-extrabold tabular-nums">{money(costs.total)}</p>
          </div>
          <div>
            <p className="text-sm text-white/70">Per person</p>
            <p className="font-display text-2xl font-bold tabular-nums">{money(costs.per_person)}</p>
          </div>
          <p className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${costs.within_budget ? "bg-teal text-white" : "bg-rust-soft text-rust"}`}>
            {costs.within_budget ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {costs.within_budget ? `${money(costs.difference)} under your ${money(costs.budget)} budget` : `${money(-costs.difference)} over your ${money(costs.budget)} budget`}
          </p>
        </div>
        {plan.season_note && <p className="mt-4 text-sm text-white/80">{plan.season_note}</p>}
      </header>

      <div className="mt-6">
        <BookTickets plan={plan} onChange={onChange} />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          {plan.unscheduled.some((u) => u.pinned) && (
            <Notice>{plan.unscheduled.filter((u) => u.pinned).map((u) => `${u.name}: ${u.reason}`).join(" ")}</Notice>
          )}
          {plan.days.map((day) => <DayCard key={day.day} day={day} />)}
          {plan.unscheduled.some((u) => !u.pinned) && (
            <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
              <b className="text-ink">Also worth it if you have time:</b> {plan.unscheduled.filter((u) => !u.pinned).map((u) => u.name).join(", ")}.
              Add a day or switch to a faster pace to fit them in.
            </p>
          )}
        </div>

        <div className="space-y-5">
          <Expenses plan={plan} costs={costs} />
          <Stay plan={plan} />
          <Section title="Don't miss" icon={Star}>
            <ul className="space-y-2 text-sm">{plan.dont_miss.map((x) => <li key={x} className="flex gap-2"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-marigold" />{x}</li>)}</ul>
          </Section>
          <Section title="Tips & rules" icon={ShieldAlert}>
            <ul className="space-y-2.5 text-sm">{plan.tips.map((x) => <li key={x} className="flex gap-2"><Info size={14} className="mt-0.5 shrink-0 text-ink-soft" />{x}</li>)}</ul>
          </Section>
          <Section title="Food to try" icon={UtensilsCrossed}>
            <div className="flex flex-wrap gap-1.5">{plan.local_food.map((f) => <span key={f} className="rounded-full bg-paper px-3 py-1 text-sm">{f}</span>)}</div>
          </Section>
          <Section title="Getting around" icon={Bus}>
            <p className="text-sm">{plan.getting_around}</p>
            <p className="mt-2 text-sm text-muted">Best months to visit: {monthRange(plan.best_months)}</p>
          </Section>
          <details className="rounded-xl border border-line bg-white p-4 text-sm text-muted">
            <summary className="cursor-pointer font-bold text-ink">How this plan was made</summary>
            <p className="mt-2">{plan.method}</p>
          </details>
        </div>
      </div>
    </div>
  );
}

function DayCard({ day }) {
  const date = day.date ? new Date(day.date + "T00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }) : null;
  return (
    <article className="rounded-2xl border border-line bg-white p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold text-ink">
          <span className="mr-2 text-marigold">Day {day.day}</span>{day.title}
        </h2>
        <p className="text-xs text-muted">{date && <>{date} · </>}{day.visit_hours} hr sightseeing · about {Math.round(day.km)} km</p>
      </div>

      {day.blocks.length === 0 ? (
        <p className="rounded-lg bg-paper p-4 text-sm">A free day. Use it to rest or explore at your own pace.</p>
      ) : (
        <ol className="route space-y-3">
          {day.blocks.map((b, i) => <Block key={i} block={b} />)}
        </ol>
      )}

      {day.free_day_ideas.length > 0 && (
        <div className="mt-4 rounded-lg bg-marigold-soft/60 p-3 text-sm">
          <p className="font-bold text-ink">You have spare time today. Ideas:</p>
          <ul className="mt-1 list-disc pl-5">{day.free_day_ideas.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
    </article>
  );
}

function Block({ block }) {
  const time = (
    <span className="w-[4.6rem] shrink-0 pt-0.5 text-right text-xs font-bold tabular-nums text-muted sm:w-[5.6rem] sm:text-sm">{block.start}</span>
  );
  if (block.type !== "visit") {
    const Icon = block.type === "meal" ? UtensilsCrossed : block.type === "return" ? Home : Coffee;
    return (
      <li className="relative flex items-center gap-3">
        {time}
        <span className="relative z-10 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-line bg-white" />
        <span className="flex items-center gap-1.5 text-sm text-muted"><Icon size={14} />{block.label}</span>
      </li>
    );
  }
  const p = block.place;
  return (
    <li className="relative flex gap-3">
      {time}
      <span className={`relative z-10 mt-0.5 h-5 w-5 shrink-0 rounded-full border-4 ${p.must_see ? "border-marigold bg-white" : "border-ink bg-white"}`} />
      <div className="min-w-0 flex-1 pb-1">
        {block.travel_min > 0 && (
          <p className="mb-1 flex items-center gap-1 text-xs text-muted"><Car size={12} />{block.travel_km < 0.8 ? "Short walk" : `${block.travel_min} min, ${block.travel_km} km`}</p>
        )}
        <p className="font-bold">{p.name}</p>
        <p className="text-sm text-muted">{p.description}</p>
        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          <span>{block.start}–{block.end}</span>
          <span>{p.area}</span>
          <span>{p.cost ? `${money(p.cost)} per person` : "Free entry"}</span>
        </p>
        {p.tip && <p className="mt-1 flex items-start gap-1 text-xs text-ink"><Sun size={12} className="mt-0.5 shrink-0 text-marigold" />{p.tip}</p>}
      </div>
    </li>
  );
}

function Expenses({ plan, costs: c }) {
  const travelMode = plan.travel?.budget_mode;
  const rows = [
    ...(c.travel ? [["Travel (round trip)", c.travel, `${travelMode[0].toUpperCase() + travelMode.slice(1)} from ${plan.travel.origin_name || "your city"}, for everyone`]] : []),
    ["Stay", c.stay, `${c.rooms} room${c.rooms > 1 ? "s" : ""} × ${c.nights} night${c.nights === 1 ? "" : "s"} at about ${money(c.per_night)}${c.peak_season ? " (peak season)" : ""}`],
    ["Food", c.food, "Breakfast, lunch, dinner and snacks"],
    ["Local transport", c.local_transport, `${c.vehicles} vehicle${c.vehicles > 1 ? "s" : ""}, based on the distance each day`],
    ["Entry tickets & activities", c.entry_tickets, "For everyone in the group"],
    ["Buffer (8%)", c.buffer, "Tips, water, small extras"],
  ];
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return (
    <Section title="Expenses" icon={Wallet}>
      <ul className="space-y-3">
        {rows.map(([label, value, note]) => (
          <li key={label}>
            <div className="flex justify-between text-sm"><span className="font-bold">{label}</span><span className="tabular-nums">{money(value)}</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-paper"><div className="h-full rounded-full bg-ink" style={{ width: `${(value / max) * 100}%` }} /></div>
            <p className="mt-0.5 text-xs text-muted">{note}</p>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex justify-between border-t border-line pt-3 font-bold"><span>Total</span><span className="tabular-nums">{money(c.total)}</span></div>
      {plan.cheaper_option && (
        <p className="mt-3 rounded-lg bg-paper p-3 text-sm">
          With budget stays this comes to about <b>{money(plan.cheaper_option.total)}</b>
          {plan.cheaper_option.within_budget ? ", which fits your budget." : ". Fewer days or travellers would bring it down further."}
        </p>
      )}
      <p className="mt-3 text-xs text-muted">These are planning estimates, not live prices.{!c.travel && <> Travel to and from {plan.destination.name} isn't included. Use "Add to budget" under Book tickets.</>}</p>
    </Section>
  );
}

function Stay({ plan }) {
  const [tier, setTier] = useState(plan.hotels.tier);
  const range = plan.hotels.price_ranges[tier];
  return (
    <Section title="Where to stay" icon={BedDouble}>
      <div className="mb-3 flex gap-1 rounded-lg bg-paper p-1" role="tablist">
        {TIERS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tier === t.id} onClick={() => setTier(t.id)}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold ${tier === t.id ? "bg-white text-ink shadow-sm" : "text-muted"}`}>{t.label}</button>
        ))}
      </div>
      <p className="text-sm"><b className="tabular-nums">{money(range.low)}–{money(range.high)}</b> a night per room, usually.</p>
      <p className="mb-3 text-xs text-muted">{TIERS.find((t) => t.id === tier).hint}. You'll need {plan.hotels.rooms} room{plan.hotels.rooms > 1 ? "s" : ""}.</p>
      <ul className="space-y-3">
        {plan.hotels.areas.map((a) => (
          <li key={a.area} className="border-t border-line pt-3 first:border-0 first:pt-0">
            <p className="font-bold">{a.area}</p>
            <p className="text-sm">{a.best_for}</p>
            <p className="text-xs text-muted">{a.note}</p>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted">Compare live prices on a booking app before you pay.</p>
    </Section>
  );
}

// Adds the chosen round-trip travel estimate to the trip totals.
function withTravel(costs, travel, people) {
  if (!travel) return { ...costs, travel: 0 };
  const total = costs.total + travel;
  return { ...costs, travel, total, per_person: Math.round(total / people), within_budget: total <= costs.budget, difference: costs.budget - total };
}
