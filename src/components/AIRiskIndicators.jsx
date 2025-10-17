import { useState } from "react";

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

export default function AIRiskIndicators({ features }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState(null);
  const [err, setErr] = useState("");

  async function run() {
    setLoading(true);
    setItems(null);
    setErr("");
    try {
      const res = await fetch(`${FUNCTIONS_URL}/ai-assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "risk_indicators",
          payload: { features: features || {} },
        }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "AI error");

      // le backend renvoie un bloc de texte -> on split en puces
      const lines = String(j.text || "")
        .split("\n")
        .map((s) => s.replace(/^[\-\*\u2022]\s*/, "").trim())
        .filter(Boolean);
      setItems(lines);
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200/20 px-4 py-3 bg-white/5">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-sm">Key Risk Indicators</h3>
        <button
          onClick={run}
          disabled={loading}
          className="ml-auto px-3 py-1 rounded bg-slate-800 text-white text-xs hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? "Analyzing…" : "Generate"}
        </button>
      </div>

      {err ? (
        <div className="mt-3 text-red-400 text-xs">❌ {err}</div>
      ) : null}

      {items ? (
        <ul className="mt-2 list-disc list-inside text-sm">
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs opacity-70">
          Click “Generate” to create an AI checklist.
        </p>
      )}
    </div>
  );
}
