// Step 2: every tourist place in the destination + trip settings (days, people, budget, stay, pace).
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Clock3, IndianRupee, Pin, Ban, Loader2, Star, Sunrise, Sunset, Moon, Plane, Info } from "lucide-react";
import { api, money, VIBES, TIERS, PACES, BEST_TIME, monthRange } from "../lib.js";
import { Notice, NumberStepper, Segmented, VibeChip, MonthStrip } from "./ui.jsx";

const TIME_ICON = { sunrise: Sunrise, sunset: Sunset, evening: Moon };

export default function DestinationStep({ destId, settings, setSettings, onBack, onPlan }) {
  const [dest, setDest] = useState(null);
  const [error, setError] = useState("");
  const [building, setBuilding] = useState(false);
  const { interests, days, groupSize, budget, tier, pace, startDate, mustInclude, skip } = settings;
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }));

  // Re-score places whenever the things that affect the score change.
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ interests: interests.join(","), budget, group_size: groupSize, days });
      api(`/api/destinations/${destId}?${qs}`).then((d) => alive && setDest(d)).catch((e) => alive && setError(e.message));
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [destId, interests, budget, groupSize, days]);

  const startMonth = startDate ? Number(startDate.slice(5, 7)) : null;
  const stayRange = dest?.costs.stay[tier];
  const nights = Math.max(days - 1, 0);
  const rooms = Math.ceil(groupSize / 2);

  function cycle(id) {
    // none -> must include -> skip -> none
    if (mustInclude.includes(id)) set({ mustInclude: mustInclude.filter((x) => x !== id), skip: [...skip, id] });
    else if (skip.includes(id)) set({ skip: skip.filter((x) => x !== id) });
    else set({ mustInclude: [...mustInclude, id] });
  }

  async function build() {
    setError(""); setBuilding(true);
    try {
      const plan = await api("/api/generate", {
        method: "POST",
        body: {
          destination: destId, days, group_size: groupSize, budget: Number(budget), interests, pace,
          stay_tier: tier, start_date: startDate || null, must_include: mustInclude, skip,
        },
      });
      onPlan(plan);
    } catch (e) { setError(e.message); } finally { setBuilding(false); }
  }

  const counts = useMemo(() => ({ pinned: mustInclude.length, skipped: skip.length }), [mustInclude, skip]);

  if (!dest) {
    return (
      <div className="py-16">
        <Notice>{error}</Notice>
        {!error && <p className="flex items-center gap-2 text-muted"><Loader2 className="animate-spin" size={18} /> Loading places</p>}
        <button onClick={onBack} className="mt-4 text-sm font-bold text-ink underline">Back to destinations</button>
      </div>
    );
  }

  return (
    <div>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm font-bold text-muted hover:text-ink">
        <ArrowLeft size={16} /> All destinations
      </button>

      <header className="rounded-2xl bg-ink p-6 text-white md:p-8">
        <div className="grid gap-6 md:grid-cols-[1fr_minmax(0,320px)] md:items-end">
          <div>
            <p className="text-sm text-white/70">{dest.state}</p>
            <h1 className="text-4xl font-extrabold md:text-5xl">{dest.name}</h1>
            <p className="mt-2 max-w-xl text-white/85">{dest.tagline}</p>
            <p className="mt-4 flex max-w-xl items-start gap-2 text-sm text-white/75"><Plane size={16} className="mt-0.5 shrink-0" />{dest.getting_there}</p>
          </div>
          <div>
            <p className="mb-2 text-sm text-white/80">Best time: <b className="text-white">{monthRange(dest.best_months)}</b> · Ideal stay {dest.ideal_days[0]}–{dest.ideal_days[1]} days</p>
            <MonthStrip best={dest.best_months} avoid={dest.avoid_months} highlight={startMonth} />
          </div>
        </div>
      </header>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Places */}
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-2xl font-bold text-ink">{dest.places.length} places to see</h2>
              <p className="text-sm text-muted">The number is how well a place matches you, out of 100. Tap a place to mark it <b>must go</b>, tap again to <b>skip</b> it. Leave the rest and the planner picks the best ones that fit.</p>
            </div>
            <p className="text-xs text-muted">{counts.pinned} must go · {counts.skipped} skipped</p>
          </div>

          <div className="mb-4 flex flex-wrap gap-1.5" aria-label="Your interests">
            {VIBES.filter((v) => dest.vibes[v.id] > 0).map((v) => (
              <VibeChip key={v.id} small vibe={v} active={interests.includes(v.id)}
                onClick={() => set({ interests: interests.includes(v.id) ? interests.filter((x) => x !== v.id) : [...interests, v.id] })} />
            ))}
          </div>

          <ul className="space-y-2">
            {dest.places.map((p) => {
              const state = mustInclude.includes(p.id) ? "must" : skip.includes(p.id) ? "skip" : "auto";
              const TimeIcon = TIME_ICON[p.best_time] || Clock3;
              return (
                <li key={p.id}>
                  <button onClick={() => cycle(p.id)} aria-label={`${p.name}: ${state === "must" ? "must go" : state === "skip" ? "skipped" : "let the planner decide"}. Tap to change.`}
                    className={`flex w-full gap-3 rounded-xl border p-4 text-left transition-colors ${state === "must" ? "border-teal bg-teal-soft/50" : state === "skip" ? "border-line bg-white opacity-55" : "border-line bg-white hover:border-ink-soft"}`}>
                    <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full border ${state === "must" ? "border-teal bg-teal text-white" : state === "skip" ? "border-line text-muted" : "border-line text-muted"}`}>
                      {state === "must" ? <Pin size={15} /> : state === "skip" ? <Ban size={15} /> : <span className="text-xs font-bold tabular-nums">{p.score}</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={`font-bold ${state === "skip" ? "line-through" : ""}`}>{p.name}</span>
                        {p.must_see && <span className="inline-flex items-center gap-1 rounded-full bg-marigold-soft px-2 py-0.5 text-[11px] font-bold text-ink"><Star size={11} /> Don't miss</span>}
                        {p.closed_days?.length > 0 && <span className="rounded-full bg-rust-soft px-2 py-0.5 text-[11px] font-bold text-rust">Closed {p.closed_days.join(", ")}</span>}
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">{p.description}</span>
                      <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                        <span>{p.area}</span>
                        <span className="inline-flex items-center gap-1"><Clock3 size={12} />{p.visit_hours} hr</span>
                        <span className="inline-flex items-center gap-1"><IndianRupee size={12} />{p.cost ? `${money(p.cost)} per person` : "Free"}</span>
                        <span className="inline-flex items-center gap-1"><TimeIcon size={12} />{BEST_TIME[p.best_time]}</span>
                      </span>
                      {p.tip && <span className="mt-1.5 flex items-start gap-1 text-xs text-ink"><Info size={12} className="mt-0.5 shrink-0" />{p.tip}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Trip settings */}
        <aside className="space-y-5 rounded-2xl border border-line bg-white p-5 lg:sticky lg:top-20">
          <h2 className="text-xl font-bold text-ink">Your trip</h2>
          <div className="grid grid-cols-2 gap-3">
            <NumberStepper label="Days" unit="days" value={days} min={1} max={14} onChange={(v) => set({ days: v })} />
            <NumberStepper label="Travellers" unit="people" value={groupSize} min={1} max={20} onChange={(v) => set({ groupSize: v })} />
          </div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Total budget for the group</span>
            <span className="flex items-center rounded-lg border border-line bg-white px-3 focus-within:border-ink">
              <span className="text-muted">₹</span>
              <input type="number" min="1000" step="500" value={budget} onChange={(e) => set({ budget: e.target.value })}
                className="w-full bg-transparent px-2 py-2.5 outline-none" />
            </span>
            <span className="mt-1 block text-xs text-muted">Local costs only. Flights or trains to {dest.name} aren't included.</span>
          </label>
          <Segmented label="Where you'll stay" options={TIERS} value={tier} onChange={(v) => set({ tier: v })} />
          {stayRange && (
            <p className="-mt-2 text-xs text-muted">
              About {money(stayRange[0])}–{money(stayRange[1])} a night per room · {rooms} room{rooms > 1 ? "s" : ""} × {nights} night{nights === 1 ? "" : "s"}
            </p>
          )}
          <Segmented label="Pace" options={PACES} value={pace} onChange={(v) => set({ pace: v })} />
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Start date <span className="font-normal text-muted">(optional)</span></span>
            <input type="date" value={startDate} onChange={(e) => set({ startDate: e.target.value })}
              className="w-full rounded-lg border border-line bg-white p-2.5" />
            <span className="mt-1 block text-xs text-muted">Helps us avoid places on the days they're closed.</span>
          </label>
          <Notice>{error}</Notice>
          <button onClick={build} disabled={building}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-marigold px-5 py-3.5 font-bold text-ink hover:brightness-95 disabled:opacity-60">
            {building ? <><Loader2 size={18} className="animate-spin" /> Building your plan</> : `Build my ${days}-day plan`}
          </button>
        </aside>
      </div>
    </div>
  );
}
