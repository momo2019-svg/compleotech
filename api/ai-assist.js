// api/ai-assist.js  (Vercel Edge Function)
// Requiert la variable d'environnement OPENAI_API_KEY dans Vercel

export const config = { runtime: "edge" };

const MODEL = "gpt-4o-mini"; // ou le modèle que tu veux

function sysPrompt(mode) {
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

async function callOpenAI(apiKey, messages) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.2,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`OpenAI error ${r.status}: ${t}`);
  }
  const j = await r.json();
  return j?.choices?.[0]?.message?.content || "";
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  };
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Use POST" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

    const body = await req.json();
    const mode = body?.mode || "chat";
    const system = sysPrompt(mode);
    const user = JSON.stringify(body?.payload ?? {}, null, 2);

    const messages = [
      { role: "system", content: system },
      ...(Array.isArray(body?.history) ? body.history : []),
      { role: "user", content: user },
    ];

    const text = await callOpenAI(apiKey, messages);

    return new Response(JSON.stringify({ ok: true, text }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders() },
    });
  }
}
