// src/pages/AlertsDetails.jsx
import { useEffect, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase.js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

function Row({ label, value }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"160px 1fr", gap:8, padding:"6px 0" }}>
      <div style={{ color:"#94a3b8" }}>{label}</div>
      <div>{value ?? "-"}</div>
    </div>
  );
}

export default function AlertsDetails() {
  const { id } = useParams();

  const [alert, setAlert] = useState(null);
  const [cust, setCust] = useState(null);
  const [txn, setTxn] = useState(null);
  const [finding, setFinding] = useState(null);

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    setLoading(true);

    // 1) Alerte (sélection souple pour éviter les colonnes manquantes)
    const { data: a, error: eA } = await supabase
      .from("alerts")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (eA || !a) {
      setAlert(null); setCust(null); setTxn(null); setFinding(null);
      setLoading(false);
      return;
    }
    setAlert(a);

    // 2) Client (si colonne + valeur)
    let custData = null;
    if (Object.prototype.hasOwnProperty.call(a, "customer_id") && a.customer_id) {
      const { data } = await supabase
        .from("customers")
        .select("id,name,email,country,tier,created_at")
        .eq("id", a.customer_id)
        .maybeSingle();
      custData = data ?? null;
    }
    setCust(custData);

    // 3) Transaction: a.transaction_id sinon dernier lien alert_transactions
    let txnId = null;
    if (Object.prototype.hasOwnProperty.call(a, "transaction_id") && a.transaction_id) {
      txnId = a.transaction_id;
    } else {
      const { data: link } = await supabase
        .from("alert_transactions")
        .select("txn_id")
        .eq("alert_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      txnId = link?.txn_id ?? null;
    }

    let txnData = null;
    if (txnId) {
      const { data } = await supabase
        .from("transactions")
        .select("id,amount,currency,channel,origin_country,destination_country,created_at")
        .eq("id", txnId)
        .maybeSingle();
      txnData = data ?? null;
    }
    setTxn(txnData);

    // 4) Dernier AI finding
    const { data: f } = await supabase
      .from("ai_findings")
      .select("*")
      .eq("alert_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setFinding(f ?? null);

    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    // live sur ai_findings pour cette alerte
    const ch = supabase
      .channel(`ai-findings-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ai_findings", filter: `alert_id=eq.${id}` },
        load
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [id, load]);

  // --- IMPORTANT: fallback si invoke échoue (réseau/CORS) ---
  async function runAI() {
    try {
      setErr("");
      setRunning(true);

      // 1) Chemin normal via supabase-js
      const { error } = await supabase.functions.invoke("agent-run", {
        body: { alert_id: id },
      });
      if (error) throw error;

    } catch (e1) {
      // 2) Fallback direct sur l'URL des Edge Functions (avec ANON KEY)
      try {
        const url = `${SUPABASE_URL}/functions/v1/agent-run`;
        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ alert_id: id }),
        });
        if (!resp.ok) {
          const txt = await resp.text().catch(() => "");
          throw new Error(`HTTP ${resp.status}: ${txt}`);
        }
      } catch (e2) {
        console.error(e1, e2);
        setErr(e2?.message || e1?.message || "Erreur agent-run");
        setRunning(false);
        return;
      }
    }

    await load();
    setRunning(false);
  }

  if (loading) {
    return <div className="card"><div className="card body">Chargement…</div></div>;
  }

  if (!alert) {
    return (
      <div className="card">
        <div className="card body">
          <div style={{ marginBottom:12 }}>
            <Link to="/alerts" className="btn">← Retour</Link>
          </div>
          Alerte introuvable.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div className="card hdr" style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <Link to="/alerts" className="btn" style={{ marginRight:8 }}>← Retour</Link>
            <strong>Alerte #{alert.id}</strong>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <span className={`chip ${alert.status === "OPEN" ? "open" : alert.status === "UNDER_REVIEW" ? "review" : "closed"}`}>
              {alert.status}
            </span>
            <button className="btn btn--brand" onClick={runAI} disabled={running}>
              {running ? "Génération…" : "Run AI Findings"}
            </button>
          </div>
        </div>

        <div className="card body" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          {/* Contexte */}
          <div className="card" style={{ margin:0 }}>
            <div className="card hdr">Contexte</div>
            <div className="card body">
              <Row label="Score" value={alert.score} />
              <Row label="Message" value={alert.message} />
              <Row label="Créée le" value={new Date(alert.created_at).toLocaleString()} />
              <hr style={{ border:"none", borderTop:"1px solid #1f2937", margin:"10px 0" }} />
              <Row label="Client" value={cust?.name} />
              <Row label="Email" value={cust?.email} />
              <Row label="Pays client" value={cust?.country} />
              <Row label="Tier KYC" value={cust?.tier} />
              <hr style={{ border:"none", borderTop:"1px solid #1f2937", margin:"10px 0" }} />
              <Row
                label="Transaction"
                value={
                  txn
                    ? `${Intl.NumberFormat().format(txn.amount)} ${txn.currency} · ${txn.channel}`
                    : "-"
                }
              />
              <Row label="Origine" value={txn?.origin_country} />
              <Row label="Destination" value={txn?.destination_country} />
            </div>
          </div>

          {/* AI Findings */}
          <div className="card" style={{ margin:0 }}>
            <div className="card hdr">AI Findings</div>
            <div className="card body">
              {err && <div style={{ color:"#ef4444", marginBottom:10 }}>{err}</div>}

              {!finding && (
                <div style={{ color:"#94a3b8" }}>
                  Aucun résultat pour le moment. Clique “Run AI Findings”.
                </div>
              )}

              {finding && (
                <div style={{ display:"grid", gap:10 }}>
                  <Row label="Flagged activity" value={finding.flagged_activity} />
                  <Row label="Account risk" value={finding.account_risk} />
                  <Row label="Recommendation" value={finding.recommendation} />
                  <Row label="Confidence" value={finding.confidence} />
                  <div>
                    <div style={{ color:"#94a3b8", marginBottom:6 }}>Reason codes</div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {(finding.reason_codes || []).map((r, i) => (
                        <span key={i} className="pill closed" style={{ color:"#cbd5e1" }}>{r}</span>
                      ))}
                    </div>
                  </div>
                  {finding.raw && (
                    <details>
                      <summary>Raw</summary>
                      <pre style={{ whiteSpace:"pre-wrap" }}>
                        {typeof finding.raw === "string" ? finding.raw : JSON.stringify(finding.raw, null, 2)}
                      </pre>
                    </details>
                  )}
                  <div style={{ color:"#94a3b8", fontSize:12 }}>
                    Généré le {new Date(finding.created_at).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
