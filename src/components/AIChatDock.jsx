import { useEffect, useRef, useState } from "react";

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;

export default function AIChatDock({ context }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // messages: [{role:'user'|'assistant', content:string}]
  const [msgs, setMsgs] = useState([
    { role: "assistant", content: "Salut ! Pose-moi une question sur cette alerte ou ce client." },
  ]);
  const inputRef = useRef(null);

  async function send() {
    const content = (inputRef.current?.value || "").trim();
    if (!content) return;

    // push user message
    const next = [...msgs, { role: "user", content }];
    setMsgs(next);
    inputRef.current.value = "";
    setBusy(true);

    try {
      const res = await fetch(`${FUNCTIONS_URL}/ai-assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "chat",
          payload: { context: context || {}, question: content },
          history: next, // on envoie l’historique
        }),
      });
      const j = await res.json();
      setMsgs((m) => [...m, { role: "assistant", content: j.ok ? j.text : `❌ ${j.error}` }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: `❌ ${e}` }]);
    } finally {
      setBusy(false);
    }
  }

  // raccourci clavier (?)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "?") setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {/* bouton flottant */}
      <button
        className="fixed bottom-5 right-5 z-40 rounded-full px-4 py-3 bg-emerald-500 text-white shadow-lg hover:bg-emerald-600"
        onClick={() => setOpen((o) => !o)}
        title="Ouvrir le chat IA (touche ?)"
      >
        🤖 IA
      </button>

      {/* dock */}
      {open && (
        <div className="fixed bottom-20 right-5 z-40 w-[380px] max-h-[70vh] rounded-xl border border-white/10 bg-[#0b1220] text-white shadow-2xl flex flex-col">
          <div className="px-3 py-2 border-b border-white/10 flex items-center">
            <b>AI Assistant</b>
            <button className="ml-auto text-sm opacity-70 hover:opacity-100" onClick={() => setOpen(false)}>
              ✕
            </button>
          </div>

          <div className="p-3 overflow-auto space-y-2 text-sm" style={{ maxHeight: "55vh" }}>
            {msgs.map((m, i) => (
              <div
                key={i}
                className={
                  "px-2 py-1 rounded " +
                  (m.role === "assistant" ? "bg-white/5" : "bg-emerald-500/10 text-emerald-200")
                }
              >
                <div className="text-[11px] opacity-60 mb-0.5">{m.role}</div>
                <div className="whitespace-pre-wrap">{m.content}</div>
              </div>
            ))}
          </div>

          <div className="p-2 border-t border-white/10 flex gap-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="Écris ta question…"
              className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 outline-none"
              onKeyDown={(e) => (e.key === "Enter" ? send() : null)}
              disabled={busy}
            />
            <button
              onClick={send}
              disabled={busy}
              className="px-3 py-1 rounded bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              Envoyer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
