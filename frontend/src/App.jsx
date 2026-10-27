import { useEffect, useState } from "react";
import { Compass } from "lucide-react";
import { api } from "./lib.js";
import StartStep from "./components/StartStep.jsx";
import DestinationStep from "./components/DestinationStep.jsx";
import PlanStep from "./components/PlanStep.jsx";
import SavedTrips from "./components/SavedTrips.jsx";
import { Notice } from "./components/ui.jsx";

const STEPS = ["Choose a place", "Pick places & days", "Your plan"];

const defaultSettings = (interests = []) => ({
  interests, days: 3, groupSize: 2, budget: 20000, tier: "mid", pace: "balanced",
  startDate: "", mustInclude: [], skip: [],
});

export default function App() {
  const [view, setView] = useState("plan"); // "plan" | "saved"
  const [step, setStep] = useState(0);
  const [destId, setDestId] = useState(null);
  const [settings, setSettings] = useState(defaultSettings());
  const [plan, setPlan] = useState(null);
  const [savedId, setSavedId] = useState(null);
  const [trips, setTrips] = useState([]);
  const [message, setMessage] = useState({ kind: "success", text: "" });

  const [waking, setWaking] = useState(false);

  const loadTrips = () => api("/api/trips").then(setTrips).catch(() => {});
  useEffect(() => { loadTrips(); }, []);
  useEffect(() => {
    const slow = () => setWaking(true);
    const ready = () => setWaking(false);
    window.addEventListener("tm-slow", slow);
    window.addEventListener("tm-ready", ready);
    return () => { window.removeEventListener("tm-slow", slow); window.removeEventListener("tm-ready", ready); };
  }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step, view]);

  function pickDestination(id, interests) {
    setDestId(id);
    setSettings((s) => ({ ...defaultSettings(interests || []), days: s.days, groupSize: s.groupSize, budget: s.budget, tier: s.tier, pace: s.pace }));
    setPlan(null);
    setStep(1);
  }

  async function saveTrip() {
    try {
      const saved = await api("/api/trips", { method: "POST", body: plan });
      setSavedId(saved.id);
      setMessage({ kind: "success", text: "Trip saved. Find it under Saved trips." });
      loadTrips();
    } catch (e) { setMessage({ kind: "error", text: e.message }); }
  }

  // Called when the plan changes after it was built (e.g. a booking reference was added).
  // If the trip is already saved, keep the saved copy in sync.
  async function updatePlan(next) {
    setPlan(next);
    if (!savedId) return;
    try { await api(`/api/trips/${savedId}`, { method: "PUT", body: next }); loadTrips(); }
    catch (e) { setMessage({ kind: "error", text: e.message }); }
  }

  async function deleteTrip(id) {
    try { await api(`/api/trips/${id}`, { method: "DELETE" }); loadTrips(); }
    catch (e) { setMessage({ kind: "error", text: e.message }); }
  }

  function openTrip(trip) {
    setPlan(trip); setSavedId(trip.id); setDestId(trip.destination.id);
    const r = trip.request;
    setSettings({ interests: r.interests, days: r.days, groupSize: r.group_size, budget: r.budget, tier: r.stay_tier,
      pace: r.pace, startDate: r.start_date || "", mustInclude: r.must_include, skip: r.skip });
    setView("plan"); setStep(2);
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <button onClick={() => { setView("plan"); setStep(0); }} className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-marigold"><Compass size={20} /></span>
            <span className="font-display text-xl font-extrabold text-ink">travelmate</span>
          </button>
          <nav className="flex gap-1 text-sm font-bold">
            <button onClick={() => setView("plan")} aria-current={view === "plan"}
              className={`rounded-lg px-3 py-2 ${view === "plan" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}>Plan</button>
            <button onClick={() => { setView("saved"); loadTrips(); }} aria-current={view === "saved"}
              className={`rounded-lg px-3 py-2 ${view === "saved" ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
              Saved trips{trips.length > 0 && <span className="ml-1.5 rounded-full bg-ink px-1.5 text-xs text-white">{trips.length}</span>}
            </button>
          </nav>
        </div>
        {view === "plan" && (
          <ol className="no-print mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-3 text-xs md:px-6 md:text-sm">
            {STEPS.map((label, i) => {
              const reachable = i === 0 || (i === 1 && destId) || (i === 2 && plan);
              return (
                <li key={label} className="shrink-0">
                  <button disabled={!reachable} onClick={() => setStep(i)} aria-current={step === i ? "step" : undefined}
                    className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 font-bold ${step === i ? "bg-ink text-white" : reachable ? "text-ink hover:bg-white" : "text-muted/60"}`}>
                    <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${step === i ? "bg-marigold text-ink" : "bg-white text-ink"}`}>{i + 1}</span>
                    {label}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-6 md:px-6">
        {waking && (
          <p role="status" className="mb-4 rounded-lg bg-marigold-soft px-3 py-2.5 text-sm text-ink">
            Starting the TravelMate server. On the free plan this can take up to a minute after it's been idle.
          </p>
        )}
        {message.text && (
          <div className="mb-4" onClick={() => setMessage({ ...message, text: "" })}>
            <Notice kind={message.kind}>{message.text}</Notice>
          </div>
        )}
        {view === "saved" ? (
          <SavedTrips trips={trips} onOpen={openTrip} onDelete={deleteTrip} onNew={() => { setView("plan"); setStep(0); }} />
        ) : step === 0 ? (
          <StartStep onPick={pickDestination} />
        ) : step === 1 ? (
          <DestinationStep destId={destId} settings={settings} setSettings={setSettings}
            onBack={() => setStep(0)} onPlan={(p) => { setPlan(p); setSavedId(null); setMessage({ text: "" }); setStep(2); }} />
        ) : (
          <PlanStep plan={plan} onBack={() => setStep(1)} onSave={saveTrip} saved={Boolean(savedId)} onChange={updatePlan} />
        )}
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        TravelMate · rule-based trip planner · React, FastAPI & MongoDB
      </footer>
    </div>
  );
}
