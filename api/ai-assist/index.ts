// api/ai-assist/index.ts
// Vercel Serverless Function (Node.js runtime)
// Répond à POST /api/ai-assist
// Vars requises (dans Vercel > Project > Settings > Environment Variables):
//   - OPENAI_API_KEY
// Optionnelle:
//   - OPENAI_MODEL (par défaut "gpt-4o-mini")

// @ts-nocheck

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

type HistoryMsg = { role: "user" | "assistant"; content: string };
type Mode = "narrative" | "risk_indicators" | "rule_explainer" | "chat";

function sysPrompt(mode: Mode) {
  switch (mode) {
    case "narrative":
      return `Tu es un analyste AML senior. Rédige un résumé concis (3–6 phrases) et une recommandation d'action. Inclure montants, comptes, counterparties et signaux clés. Style neutre, clair, prêt à coller dans un case.`;
    case "risk_indicators":
      return `Tu es un auditor AML. Sors une liste à puces de "Key Risk Indicators" spécifiques, basée uniquement sur les données fournies. Chaque puce: 1 ligne, factuelle, sans spéculation.`;
    case "rule_explainer":
      return `Explique à un analyste pourquoi la règle s'est déclenchée, en reliant chaque condition aux données. Termine par "What to check next".`;
    default:
      return `Assistant produit pour une app AML. Sois exact, concis, et cite les données reçues quand c'est utile.`;
  }
}

async function callOpenAI(messages: any[]) {
  if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30_000);

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.2,
    }),
    signal: controller.signal,
  });

  clearTimeout(t);

  if (!r.ok) {
    const errTxt = await r.text().catch(() => "");
    throw new Error(`OpenAI ${r.status}: ${errTxt}`);
  }
  const j = await r.json();
  return j?.choices?.[0]?.message?.content || "";
}

export default async function handler(req: any, res: any) {
  // CORS (autorise l’app web à appeler l’API depuis le navigateur)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "Use POST" });
    return;
  }

  try {
    const raw = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const mode: Mode = (raw.mode as Mode) || "chat";
    const payload = raw.payload || {};
    const history: HistoryMsg[] = Array.isArray(raw.history) ? raw.history : [];

    const system = sysPrompt(mode);
    const user = JSON.stringify(payload, null, 2);

    // On filtre/normalise l'historique
    const cleanHistory = history
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content }));

    const messages = [{ role: "system", content: system }, ...cleanHistory, { role: "user", content: user }];

    const text = await callOpenAI(messages);
    res.status(200).json({ ok: true, text });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
