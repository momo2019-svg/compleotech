// supabase/functions/agent-run/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// --- Env
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || ""; // si vide → fallback heuristique
const OPENAI_MODEL   = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY =
  Deno.env.get("SERVICE_ROLE_KEY") ||
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// CORS (pour la démo, "*" ; mets ton domaine si besoin)
const ALLOW_ORIGIN = Deno.env.get("CORS_ORIGIN") || "*";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  global: { headers: { "x-application-name": "agent-run" } },
});

Deno.serve(async (req) => {
  // Répondre au preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: cors(),
    });
  }

  try {
    const { alert_id } = await req.json().catch(() => ({}));
    if (!alert_id) return json({ ok: false, error: "Missing alert_id" }, 400);

    // 1) Alerte
    const { data: alert, error: aErr } = await sb
      .from("alerts")
      .select("id, status, score, message, created_at, customer_id")
      .eq("id", alert_id)
      .maybeSingle();
    if (aErr) return json({ ok: false, error: aErr.message }, 500);
    if (!alert) return json({ ok: false, error: "Alert not found" }, 404);

    // 2) Transaction liée via table pivot (si présente)
    let txn: any = null;
    const { data: link, error: lErr } = await sb
      .from("alert_transactions")
      .select("txn_id")
      .eq("alert_id", alert_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lErr) return json({ ok: false, error: lErr.message }, 500);

    if (link?.txn_id) {
      const { data: txnRow, error: tErr } = await sb
        .from("transactions")
        .select("id, amount, currency, channel, origin_country, destination_country, created_at")
        .eq("id", link.txn_id)
        .maybeSingle();
      if (tErr) return json({ ok: false, error: tErr.message }, 500);
      txn = txnRow ?? null;
    }

    // 3) Client (sans champs non existants)
    let customer: any = null;
    if (alert.customer_id) {
      const { data: custRow, error: cErr } = await sb
        .from("customers")
        .select("id, name, email, country, created_at")
        .eq("id", alert.customer_id)
        .maybeSingle();
      if (cErr) return json({ ok: false, error: cErr.message }, 500);
      customer = custRow ?? null;
    }

    // 4) Contexte
    const aiContext = {
      alert: {
        id: alert.id,
        status: alert.status,
        score: alert.score,
        message: alert.message,
        created_at: alert.created_at,
      },
      customer: customer
        ? {
            id: customer.id,
            name: customer.name ?? null,
            email: customer.email ?? null,
            country: customer.country ?? null,
            created_at: customer.created_at ?? null,
            tier: "N/A",
            kyc_at: null,
          }
        : null,
      transaction: txn
        ? {
            id: txn.id,
            amount: txn.amount,
            currency: txn.currency,
            channel: txn.channel,
            origin_country: txn.origin_country,
            destination_country: txn.destination_country,
            created_at: txn.created_at,
          }
        : null,
    };

    // 5) OpenAI (robuste) + fallback
    let parsed: any = null;
    try {
      if (!OPENAI_API_KEY) throw new Error("No OPENAI_API_KEY");

      const prompt = [
        "Tu es un analyste LBC/FT.",
        "Réponds STRICTEMENT en JSON avec les clés:",
        "flagged_activity (string), account_risk (string), recommendation (string),",
        "reason_codes (array de strings), confidence (0..1).",
        "Style concis et professionnel, en français.",
        "",
        "Contexte:",
        JSON.stringify(aiContext),
      ].join("\n");

      const aiRes = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          input: prompt,
          response_format: { type: "json_object" },
        }),
      });

      const aiJson = await aiRes.json().catch(() => ({}));
      if (!aiRes.ok) throw new Error(JSON.stringify(aiJson));

      const text =
        aiJson?.output?.[0]?.content?.[0]?.text ??
        aiJson?.output_text ??
        aiJson?.choices?.[0]?.message?.content ??
        "";

      parsed = JSON.parse(text || "{}");
    } catch (_e) {
      parsed = fallbackHeuristics(aiContext);
    }

    // 6) Insert finding (inclut payload si colonne NOT NULL)
    const record = {
      alert_id,
      flagged_activity: parsed.flagged_activity ?? null,
      account_risk: parsed.account_risk ?? null,
      recommendation: parsed.recommendation ?? null,
      reason_codes: Array.isArray(parsed.reason_codes)
        ? parsed.reason_codes.map(String)
        : null,
      confidence:
        typeof parsed.confidence === "number"
          ? parsed.confidence
          : typeof parsed.confidence === "string"
          ? parseFloat(parsed.confidence)
          : 0.5,
      raw: parsed,
      payload: parsed,
    };

    const { data: ins, error: iErr } = await sb
      .from("ai_findings")
      .insert(record)
      .select("*")
      .maybeSingle();
    if (iErr) return json({ ok: false, error: iErr.message }, 500);

    return json({ ok: true, finding: ins });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});

// Helpers
function cors() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ALLOW_ORIGIN,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors() });
}

// ——— Heuristique simple ———
function fallbackHeuristics(ctx: any) {
  const s = Number(ctx?.alert?.score ?? 0);
  const t = ctx?.transaction;
  const reasons: string[] = [];

  if (t) {
    if (typeof t.amount === "number" && t.amount > 10000) reasons.push("AMOUNT_GT_10K");
    if (t.origin_country && t.destination_country && t.origin_country !== t.destination_country)
      reasons.push("COUNTRY_MISMATCH");
    if (t.channel && String(t.channel).toLowerCase().includes("cash"))
      reasons.push("CASH_CHANNEL");
  }
  if (s >= 70) reasons.push("HIGH_ALERT_SCORE");
  if (ctx?.customer?.country && t?.destination_country && ctx.customer.country !== t.destination_country)
    reasons.push("CUSTOMER_COUNTRY_DIFFERS");

  let account_risk: "low" | "medium" | "high" = "low";
  if (s >= 70 || reasons.includes("COUNTRY_MISMATCH") || reasons.includes("AMOUNT_GT_10K")) {
    account_risk = "high";
  } else if (s >= 40 || reasons.length >= 2) {
    account_risk = "medium";
  }

  const flagged_activity =
    account_risk === "high"
      ? "Patron de transaction potentiellement suspect"
      : "Comportement à surveiller";

  const recommendation =
    account_risk === "high"
      ? "Escalader vers revue manuelle immédiate et collecter justificatifs."
      : "Surveiller et demander informations complémentaires si récidive.";

  const confidence = account_risk === "high" ? 0.8 : account_risk === "medium" ? 0.6 : 0.4;

  return {
    flagged_activity,
    account_risk,
    recommendation,
    reason_codes: reasons.length ? reasons : ["HEURISTIC_FALLBACK"],
    confidence,
    generated_by: "fallback",
  };
}
