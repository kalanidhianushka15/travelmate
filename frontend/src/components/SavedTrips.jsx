import { Trash2, Bookmark } from "lucide-react";
import { money } from "../lib.js";

export default function SavedTrips({ trips, onOpen, onDelete, onNew }) {
  return (
    <section className="pt-4">
      <h1 className="text-4xl font-extrabold text-ink">Saved trips</h1>
      {trips.length === 0 ? (
        <div className="mt-6 rounded-2xl border-2 border-dashed border-line p-10 text-center">
          <Bookmark size={28} className="mx-auto text-muted" />
          <p className="mt-3 font-display text-xl font-bold text-ink">No saved trips yet</p>
          <p className="mt-1 text-sm text-muted">Build a plan and press "Save trip" to keep it here.</p>
          <button onClick={onNew} className="mt-5 rounded-lg bg-ink px-5 py-3 text-sm font-bold text-white">Plan a trip</button>
        </div>
      ) : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((t) => (
            <li key={t.id} className="flex flex-col rounded-xl border border-line bg-white p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-display text-xl font-bold text-ink">{t.request?.days} days in {t.destination?.name}</p>
                  <p className="text-sm text-muted">{t.request?.group_size} travellers · saved {new Date(t.created_at).toLocaleDateString("en-IN")}</p>
                </div>
                <button aria-label={`Delete ${t.destination?.name} trip`} onClick={() => onDelete(t.id)}
                  className="rounded-md p-2 text-muted hover:bg-rust-soft hover:text-rust"><Trash2 size={16} /></button>
              </div>
              <p className="mt-3 font-display text-2xl font-bold tabular-nums">{money(t.costs?.total)}</p>
              <button onClick={() => onOpen(t)} className="mt-4 rounded-lg border border-line py-2.5 text-sm font-bold hover:border-ink">Open plan</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
