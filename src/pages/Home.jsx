// src/pages/Home.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";

const RISK = ["LOW", "MEDIUM", "HIGH"];
const CHANNELS = ["CARD", "CASH", "CRYPTO", "WIRE", "ACH"];

// Petite pastille de statut (utilise les classes .chip .open .review .closed de index.css)
function StatusChip({ status }) {
  const cls =
    status === "OPEN" ? "chip open" :
    status === "UNDER_REVIEW" ? "chip review" :
    "chip closed";
  return <span className={cls}>{status}</span>;
}

export default function Home() {
  // KPI
  const [kpi, setKpi] = useState({ customers: 0, transactions: 0, alertsOpen: 0 });

  // Quick add client
  const [cName, setCName] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cCountry, setCCountry] = useState("");
  const [cRisk, setCRisk] = useState("LOW");
  const [cPEP, setCPEP] = useState(false);
  const [cMsg, setCMsg] = useState("");

  // Quick add transaction
  const [customers, setCustomers] = useState([]);
  const [tCustomer, setTCustomer] = useState("");
  const [tAmount, setTAmount] = useState("");
  const [tCurrency, setTCurrency] = useState("USD");
  const [tChannel, setTChannel] = useState("CARD");
  const [tOrig, setTOrig] = useState("");
  const [tDest, setTDest] = useState("");
  const [tMsg, setTMsg] = useState("");

  // Dernières alertes
  const [alerts, setAlerts] = useState([]);

  async function load() {
    const [{ count: c1 }, { count: c2 }, { count: c3 }] = await Promise.all([
      supabase.from("customers").select("id", { head: true, count: "exact" }),
      supabase.from("transactions").select("id", { head: true, count: "exact" }),
      supabase.from("alerts").select("id", { head: true, count: "exact" }).in("status", ["OPEN", "UNDER_REVIEW"]),
    ]);
    setKpi({ customers: c1 ?? 0, transactions: c2 ?? 0, alertsOpen: c3 ?? 0 });

    const { data: custs = [] } = await supabase.from("customers").select("id, name").order("name");
    setCustomers(custs);
    if (!tCustomer && custs.length) setTCustomer(custs[0].id);

    const { data: als = [] } = await supabase
      .from("alerts")
      .select(`id, message, status, score, created_at, customer:customers(name)`)
      .order("created_at", { ascending: false })
      .limit(5);
    setAlerts(als);
  }

  useEffect(() => {
    load();
    // realtime sur alerts pour rafraîchir la liste & KPI
    const ch = supabase
      .channel("home-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  async function addClient() {
    setCMsg("");
    if (!cName || !cEmail || !cCountry) {
      return setCMsg("Nom, email et pays sont requis.");
    }
    const { error } = await supabase.from("customers").insert({
      name: cName.trim(),
      email: cEmail.trim(),
      country: cCountry.trim().toUpperCase(),
      risk_level: cRisk,
      pep: !!cPEP,
    });
    if (error) setCMsg(error.message);
    else {
      setCMsg("✅ Client ajouté !");
      setCName(""); setCEmail(""); setCCountry(""); setCRisk("LOW"); setCPEP(false);
      load();
    }
  }

  async function addTxn() {
    setTMsg("");
    if (!tCustomer || !tAmount || Number(tAmount) <= 0) {
      return setTMsg("Client et montant > 0 requis.");
    }
    const row = {
      customer_id: tCustomer,
      amount: Number(tAmount),
      currency: tCurrency.toUpperCase(),
      channel: tChannel,
      origin_country: tOrig ? tOrig.toUpperCase() : null,
      destination_country: tDest ? tDest.toUpperCase() : null,
    };
    const { error } = await supabase.from("transactions").insert(row);
    if (error) setTMsg(error.message);
    else {
      setTMsg("✅ Transaction ajoutée !");
      setTAmount(""); setTOrig(""); setTDest("");
      load();
    }
  }

  return (
    <div>
      {/* KPI */}
      <div className="kpis">
        <div className="card kpi">
          <div className="kpi-label">Clients</div>
          <div className="kpi-value">{kpi.customers}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Transactions</div>
          <div className="kpi-value">{kpi.transactions}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Alertes ouvertes</div>
          <div className="kpi-value">{kpi.alertsOpen}</div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">Actions rapides</div>
          <div className="kpi-value">🚀</div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="card" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* Créer client */}
        <div>
          <div className="card hdr">Créer un client</div>
          <div className="card body" style={{ display: "grid", gap: 8 }}>
            {cMsg && <div style={{ color: cMsg.startsWith("✅") ? "#065f46" : "#b91c1c" }}>{cMsg}</div>}
            <input placeholder="Nom complet" value={cName} onChange={e => setCName(e.target.value)} />
            <input placeholder="Email" type="email" value={cEmail} onChange={e => setCEmail(e.target.value)} />
            <div style={{ display: "flex", gap: 6 }}>
              <input placeholder="Pays (FR…)" value={cCountry} onChange={e => setCCountry(e.target.value)} maxLength={2} />
              <select value={cRisk} onChange={e => setCRisk(e.target.value)}>
                {RISK.map(r => <option key={r}>{r}</option>)}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={cPEP} onChange={e => setCPEP(e.target.checked)} />
                PEP
              </label>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {/* ⬇️ bouton amélioré */}
              <button className="btn btn--brand" onClick={addClient}>Ajouter</button>
              <Link className="btn" to="/clients">Ouvrir Clients</Link>
            </div>
          </div>
        </div>

        {/* Nouvelle transaction */}
        <div>
          <div className="card hdr">Nouvelle transaction</div>
          <div className="card body" style={{ display: "grid", gap: 8 }}>
            {tMsg && <div style={{ color: tMsg.startsWith("✅") ? "#065f46" : "#b91c1c" }}>{tMsg}</div>}
            <select value={tCustomer} onChange={e => setTCustomer(e.target.value)}>
              {customers.length === 0
                ? <option value="">— Aucun client —</option>
                : customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
              }
            </select>
            <div style={{ display: "flex", gap: 6 }}>
              <input type="number" min="0" step="0.01" placeholder="Montant" value={tAmount} onChange={e => setTAmount(e.target.value)} />
              <select value={tCurrency} onChange={e => setTCurrency(e.target.value)}>
                <option>USD</option><option>EUR</option><option>MAD</option>
              </select>
              <select value={tChannel} onChange={e => setTChannel(e.target.value)}>
                {CHANNELS.map(ch => <option key={ch} value={ch}>{ch}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input placeholder="Origine (FR…)" value={tOrig} onChange={e => setTOrig(e.target.value)} maxLength={2} />
              <input placeholder="Destination (US…)" value={tDest} onChange={e => setTDest(e.target.value)} maxLength={2} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {/* ⬇️ bouton amélioré */}
              <button className="btn btn--brand" onClick={addTxn}>Ajouter</button>
              <Link className="btn" to="/transactions">Ouvrir Transactions</Link>
            </div>
          </div>
        </div>
      </div>

      {/* Dernières alertes */}
      <div className="card">
        <div className="card hdr">Dernières alertes</div>
        <div className="card body" style={{ padding: 0 }}>
          {alerts.length === 0 ? (
            <div style={{ padding: 12, color: "#6b7280" }}>Aucune alerte.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Message</th>
                  <th>Score</th>
                  <th>Statut</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map(a => (
                  <tr key={a.id}>
                    <td>{a.customer?.name || "-"}</td>
                    <td>{a.message || "-"}</td>
                    <td>{a.score ?? "-"}</td>
                    {/* ⬇️ pastille jolie */}
                    <td><StatusChip status={a.status} /></td>
                    <td>{new Date(a.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
