// Small reusable building blocks.
import { Minus, Plus, AlertCircle, CheckCircle2 } from "lucide-react";
import { MONTHS } from "../lib.js";

export function Notice({ kind = "error", children }) {
  if (!children) return null;
  const styles = kind === "error" ? "bg-rust-soft text-rust" : "bg-teal-soft text-teal";
  const Icon = kind === "error" ? AlertCircle : CheckCircle2;
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${styles}`}>
      <Icon size={17} className="mt-0.5 shrink-0" /> <span>{children}</span>
    </p>
  );
}

export function NumberStepper({ label, value, onChange, min = 1, max = 14, unit }) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-bold">{label}</span>
      <div className="flex items-center justify-between rounded-lg border border-line bg-white p-1">
        <button type="button" aria-label={`Fewer ${unit}`} disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="grid h-9 w-9 place-items-center rounded-md text-ink hover:bg-paper disabled:opacity-30"><Minus size={16} /></button>
        <span className="text-base font-bold tabular-nums">{value} {value === 1 ? unit.replace(/s$/, "") : unit}</span>
        <button type="button" aria-label={`More ${unit}`} disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="grid h-9 w-9 place-items-center rounded-md text-ink hover:bg-paper disabled:opacity-30"><Plus size={16} /></button>
      </div>
    </div>
  );
}

export function Segmented({ label, options, value, onChange }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-bold">{label}</legend>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button type="button" key={o.id} onClick={() => onChange(o.id)} aria-pressed={value === o.id}
            className={`rounded-lg border px-2 py-2 text-left transition-colors ${value === o.id ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink-soft"}`}>
            <span className="block text-sm font-bold">{o.label}</span>
            {o.hint && <span className={`block text-xs ${value === o.id ? "text-white/75" : "text-muted"}`}>{o.hint}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function VibeChip({ vibe, active, onClick, small }) {
  const Icon = vibe.icon;
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border font-bold transition-colors ${small ? "px-2.5 py-1 text-xs" : "px-3.5 py-2 text-sm"} ${active ? "border-marigold bg-marigold-soft text-ink" : "border-line bg-white text-muted hover:border-ink-soft hover:text-ink"}`}>
      <Icon size={small ? 13 : 15} /> {vibe.label}
    </button>
  );
}

// A 12-month strip: teal = best months, rust = months to avoid.
export function MonthStrip({ best = [], avoid = [], highlight }) {
  return (
    <div>
      <div className="grid grid-cols-12 gap-0.5" aria-hidden="true">
        {MONTHS.map((m, i) => {
          const n = i + 1;
          const tone = best.includes(n) ? "bg-teal text-white" : avoid.includes(n) ? "bg-rust-soft text-rust" : "bg-white/70 text-muted";
          return (
            <span key={m} className={`relative rounded-sm py-1 text-center text-[10px] font-bold ${tone} ${highlight === n ? "ring-2 ring-marigold ring-offset-1" : ""}`}>
              {m[0]}
            </span>
          );
        })}
      </div>
      <p className="sr-only">Best months: {best.map((n) => MONTHS[n - 1]).join(", ")}. Avoid: {avoid.map((n) => MONTHS[n - 1]).join(", ") || "none"}.</p>
    </div>
  );
}

export function Section({ title, icon: Icon, children, aside }) {
  return (
    <section className="rounded-xl border border-line bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-bold text-ink">{Icon && <Icon size={18} className="text-marigold" />}{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}
