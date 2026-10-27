// Step 1: two ways in. "I know where I'm going" or "Help me choose".
import { useEffect, useState } from "react";
import { MapPin, Sparkles, Search, ArrowRight, Loader2 } from "lucide-react";
import { api, VIBES, MONTHS_LONG, COST_LEVEL, monthRange } from "../lib.js";
import { Notice, VibeChip, MonthStrip } from "./ui.jsx";

export default function StartStep({ onPick }) {
  const [mode, setMode] = useState("know");
  const [destinations, setDestinations] = useState([]);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    api("/api/destinations").then(setDestinations).catch((e) => setLoadError(e.message));
  }, []);

  return (
    <div>
      <section className="pb-8 pt-4 md:pt-8">
        <h1 className="max-w-3xl text-4xl font-extrabold leading-[1.05] text-ink md:text-6xl">Where are you headed?</h1>
        <p className="mt-3 max-w-xl text-base text-muted md:text-lg">
          Pick a place you already have in mind, or tell us the kind of trip you want and we'll suggest where to go.
        </p>
      </section>

      <div role="tablist" aria-label="How do you want to start?" className="grid gap-3 md:grid-cols-2">
        <ModeButton active={mode === "know"} onClick={() => setMode("know")} icon={MapPin}
          title="I know where I'm going" text="Choose a destination and see every place worth visiting there." />
        <ModeButton active={mode === "suggest"} onClick={() => setMode("suggest")} icon={Sparkles}
          title="Help me choose" text="Beaches, snow, temples, food… tell us what you want and we'll match places." />
      </div>

      <div className="mt-6">
        <Notice>{loadError}</Notice>
        {mode === "know"
          ? <KnowPanel destinations={destinations} onPick={onPick} />
          : <SuggestPanel destinations={destinations} onPick={onPick} />}
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, icon: Icon, title, text }) {
  return (
    <button role="tab" aria-selected={active} onClick={onClick}
      className={`flex items-start gap-4 rounded-2xl border-2 p-5 text-left transition-colors md:p-6 ${active ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink-soft"}`}>
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${active ? "bg-marigold text-ink" : "bg-paper text-ink"}`}><Icon size={22} /></span>
      <span>
        <span className="block font-display text-xl font-bold md:text-2xl">{title}</span>
        <span className={`mt-1 block text-sm ${active ? "text-white/80" : "text-muted"}`}>{text}</span>
      </span>
    </button>
  );
}

function KnowPanel({ destinations, onPick }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = destinations.filter((d) => !q || `${d.name} ${d.state} ${d.tagline}`.toLowerCase().includes(q));

  return (
    <div>
      <label className="relative block max-w-md">
        <span className="sr-only">Search destinations</span>
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a city or state"
          className="w-full rounded-lg border border-line bg-white py-3 pl-10 pr-3 outline-none focus:border-ink" />
      </label>

      {shown.length === 0 && destinations.length > 0 && (
        <p className="mt-6 text-muted">No destination matches "{query}" yet. Try "Help me choose" to find something similar.</p>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((d) => (
          <button key={d.id} onClick={() => onPick(d.id, d.top_vibes)}
            className="group rounded-xl border border-line bg-white p-4 text-left hover:border-ink">
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-display text-xl font-bold text-ink">{d.name}</span>
              <span className="text-xs text-muted">{d.state}</span>
            </span>
            <span className="mt-1 block text-sm text-muted">{d.tagline}</span>
            <span className="mt-3 block">
              <span className="mb-1 block text-xs text-muted">Best time: <b className="text-teal">{monthRange(d.best_months)}</b></span>
              <MonthStrip best={d.best_months} />
            </span>
            <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
              <span>{d.ideal_days[0]}–{d.ideal_days[1]} days</span>
              <span>{d.place_count} places</span>
              <span>{COST_LEVEL[d.cost_level]}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SuggestPanel({ onPick }) {
  const [vibes, setVibes] = useState([]);
  const [text, setText] = useState("");
  const [month, setMonth] = useState("");
  const [budgetLevel, setBudgetLevel] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const toggle = (id) => setVibes((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!vibes.length && !text.trim()) { setError("Pick at least one vibe or type what you're looking for."); return; }
    setLoading(true);
    try {
      setResult(await api("/api/suggest", {
        method: "POST",
        body: { vibes, text, month: month ? Number(month) : null, budget_level: budgetLevel ? Number(budgetLevel) : null },
      }));
    } catch (err) { setError(err.message); } finally { setLoading(false); }
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <form onSubmit={submit} className="space-y-5 rounded-2xl border border-line bg-white p-5 md:p-6">
        <div>
          <p className="mb-2 text-sm font-bold">What kind of trip?</p>
          <div className="flex flex-wrap gap-2">
            {VIBES.map((v) => <VibeChip key={v.id} vibe={v} active={vibes.includes(v.id)} onClick={() => toggle(v.id)} />)}
          </div>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold">Or describe it in your own words</span>
          <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={300}
            placeholder="Somewhere cold with temples in December, low budget"
            className="w-full resize-none rounded-lg border border-line bg-paper/60 p-3 outline-none focus:border-ink" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">When?</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="w-full rounded-lg border border-line bg-white p-2.5">
              <option value="">Not sure yet</option>
              {MONTHS_LONG.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold">Budget</span>
            <select value={budgetLevel} onChange={(e) => setBudgetLevel(e.target.value)} className="w-full rounded-lg border border-line bg-white p-2.5">
              <option value="">Any</option>
              <option value="1">Tight</option>
              <option value="2">Moderate</option>
              <option value="3">Flexible</option>
            </select>
          </label>
        </div>
        <Notice>{error}</Notice>
        <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-5 py-3.5 font-bold text-white hover:bg-ink-soft disabled:opacity-60">
          {loading ? <><Loader2 size={18} className="animate-spin" /> Finding places</> : "Suggest places"}
        </button>
      </form>

      <div aria-live="polite">
        {!result ? (
          <div className="rounded-2xl border-2 border-dashed border-line p-8 text-muted">
            <p className="font-display text-xl font-bold text-ink">Your matches will show up here</p>
            <p className="mt-2 text-sm">Each place gets a match score out of 100 based on your vibes (55), the month you're going (25) and your budget (20).</p>
          </div>
        ) : (
          <div>
            {result.understood.matched.length > 0 && (
              <p className="mb-3 text-sm text-muted">
                From your description we picked up: {result.understood.matched.map((m) => m.split(" → ")[1]).join(", ")}.
              </p>
            )}
            <ol className="space-y-3">
              {result.results.map((r, i) => (
                <li key={r.id} className={`rounded-xl border bg-white p-4 ${i === 0 ? "border-marigold" : "border-line"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-xl font-bold text-ink">{r.name} <span className="text-sm font-normal text-muted">{r.state}</span></p>
                      <p className="text-sm text-muted">{r.tagline}</p>
                    </div>
                    <div className="text-right">
                      <span className="block font-display text-2xl font-extrabold tabular-nums text-ink">{r.score}</span>
                      <span className="block text-xs text-muted">match</span>
                    </div>
                  </div>
                  {r.reasons.length > 0 && <p className="mt-2 text-sm">{r.reasons.join(". ")}.</p>}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted">Ideal for {r.ideal_days[0]}–{r.ideal_days[1]} days · {COST_LEVEL[r.cost_level]}</span>
                    <button onClick={() => onPick(r.id, result.understood.vibes)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-sm font-bold text-white hover:bg-ink-soft">
                      See places in {r.name} <ArrowRight size={15} />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
