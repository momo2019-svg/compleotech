import { useState } from "react";

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

export default function AINarrativeButton({ alertData }) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");

  async function run() {
    setLoading(true);
    setText("");
    try {
      const res = await fetch(`${FUNCTIONS_URL}/ai-assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "narrative",
          payload: {
            summary: alertData?.summary,
            entity: alertData?.entity,
            counterparties: alertData?.counterparties,
            totals: alertData?.totals,      // e.g. { sent: 19000, received: 2000 }
            window: alertData?.window,      // e.g. "2025-08-20..2025-08-23"
            channels: alertData?.channels,  // e.g. ["WIRE","CRYPTO"]
            prior_cases: alertData?.prior_cases,
            sars_history: alertData?.sars_history,
            rule_name: alertData?.rule_name,
          },
        }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "AI error");
      setText(j.text);
    } catch (e) {
      setText(`❌ ${e}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={run}
        disabled={loading}
        className="px-3 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        {loading ? "Génération…" : "Generate Narrative (AI)"}
      </button>
      {text ? (
        <textarea
          className="w-full h-48 rounded border border-gray-300 p-2 text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      ) : null}
    </div>
  );
}
