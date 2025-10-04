// src/pages/Transactions.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase.js";

const fmt = (n) => Intl.NumberFormat().format(Number(n || 0));

export default function Transactions() {
  // DATA
  const [customers, setCustomers] = useState([]); // [{id,name}]
  const [txns, setTxns] = useState([]);           // transactions brutes

  // UI state
  const [loading, setLoading] = useState(false);
  const [filterCustomer, setFilterCustomer] = useState(""); // id ou ""
  const [search, setSearch] = useState("");

  // Form
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [channel, setChannel] = useState("CARD"); // CARD/CASH/CRYPTO/WIRE/ACH
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [err, setErr] = useState("");

  // Map id -> name
  const nameById = useMemo(() => {
    const m = new Map();
    customers.forEach(c => m.set(c.id, c.name));
    return m;
  }, [customers]);

  // Liste filtrée + recherche
  const filtered = useMemo(() => {
    const byClient = filterCustomer ? txns.filter(t => t.customer_id === filterCustomer) : txns;
    const q = search.trim().toLowerCase();
    if (!q) return byClient;
    return byClient.filter(t => {
      const cname = (nameById.get(t.customer_id) || "").toLowerCase();
      const msg = [
        String(t.amount || ""),
        t.currency || "",
        t.channel || "",
        t.origin_country || "",
        t.destination_country || "",
        cname
      ].join(" ").toLowerCase();
      return msg.includes(q);
    });
  }, [txns, filterCustomer, search, nameById]);

  const totalFiltered = useMemo(
    () => filtered.reduce((s, t) => s + Number(t.amount || 0), 0),
    [filtered]
  );

  // LOADERS
  async function loadCustomers() {
    const { data } = await supabase
      .from("customers")
      .select("id, name")
      .order("name", { ascending: true });
    setCustomers(data || []);
    // si pas de client sélectionné, on met le premier pour le formulaire
    if (!customerId && (data?.length || 0) > 0) setCustomerId(data[0].id);
  }

  async function loadTxns() {
    setLoading(true);
    const { data, error } = await supabase
      .from("transactions")
      .select("id, customer_id, amount, currency, channel, origin_country, destination_country, created_at")
      .order("created_at", { ascending: false });
    if (!error) setTxns(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadCustomers();
    loadTxns();
  }, []);

  // Realtime: mettre à jour si transactions ou customers changent
  useEffect(() => {
    const chTx = supabase
      .channel("rt-transactions")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, loadTxns)
      .subscribe();

    const chCust = supabase
      .channel("rt-customers-in-tx")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, loadCustomers)
      .subscribe();

    return () => {
      supabase.removeChannel(chTx);
      supabase.removeChannel(chCust);
    };
  }, []);

  // ADD TRANSACTION
  async function addTxn() {
    setErr("");
    if (!customerId) return setErr("Choisis un client.");
    if (!amount || Number(amount) <= 0) return setErr("Montant invalide.");
    const row = {
      customer_id: customerId,
      amount: Number(amount),
      currency: (currency || "USD").toUpperCase(),
      channel,
      origin_country: origin ? origin.toUpperCase() : null,
      destination_country: destination ? destination.toUpperCase() : null,
    };
    const { error } = await supabase.from("transactions").insert(row);
    if (error) {
      setErr(error.message);
    } else {
      // reset partiel (on garde client/devise/canal)
      setAmount("");
      setOrigin("");
      setDestination("");
      await loadTxns();
    }
  }

  return (
    <div>
      {/* Formulaire */}
      <div className="card">
        <div className="card hdr">Ajouter une transaction</div>
        <div className="card body" style={{ display:"grid", gap:10 }}>
          {err && <div style={{ color:"#b91c1c" }}>{err}</div>}

          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
            {/* Client pour le formulaire d'ajout */}
            <select value={customerId} onChange={e => setCustomerId(e.target.value)}>
              {customers.length === 0 ? (
                <option value="">— Aucun client —</option>
              ) : (
                customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
              )}
            </select>

            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Montant"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />

            <select value={currency} onChange={e => setCurrency(e.target.value)}>
              <option>USD</option>
              <option>EUR</option>
              <option>MAD</option>
            </select>

            <select value={channel} onChange={e => setChannel(e.target.value)}>
              <option value="CARD">CARD</option>
              <option value="CASH">CASH</option>
              <option value="CRYPTO">CRYPTO</option>
              <option value="WIRE">WIRE</option>
              <option value="ACH">ACH</option>
            </select>

            <input
              placeholder="Origine (FR, MA, US, IR...)"
              value={origin}
              onChange={e => setOrigin(e.target.value)}
              maxLength={2}
            />
            <input
              placeholder="Destination (FR, MA, US...)"
              value={destination}
              onChange={e => setDestination(e.target.value)}
              maxLength={2}
            />

            <button className="btn btn--brand" onClick={addTxn}>Ajouter</button>
          </div>
          <div style={{ fontSize:12, color:"#94a3b8" }}>
            Rappels scoring : <b>amount &gt; 10000</b> (+30) · <b>CASH/CRYPTO</b> (+20) · <b>pays à risque</b> (+15) · <b>PEP/HIGH</b> (+15) · <b>&gt; 15000/24h</b> (+10).
          </div>
        </div>
      </div>

      {/* Filtre + recherche + total */}
      <div className="card">
        <div className="card hdr" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <select value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)}>
              <option value="">Tous les clients</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input
              className="search"
              placeholder="Recherche (client, canal, pays, devise...)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ maxWidth: 320 }}
            />
          </div>
          <div style={{ fontWeight:600 }}>
            {filtered.length} txn · Total: {fmt(totalFiltered)}
          </div>
        </div>

        {/* Tableau des transactions */}
        <div className="card body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding:14 }}>Chargement…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:14, color:"#6b7280" }}>Aucune transaction</div>
          ) : (
            <table width="100%" style={{ borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"#f9fafb", borderBottom:"1px solid #e5e7eb" }}>
                  <th style={th}>Client</th>
                  <th style={th}>Montant</th>
                  <th style={th}>Canal</th>
                  <th style={th}>Devise</th>
                  <th style={th}>Origine</th>
                  <th style={th}>Destination</th>
                  <th style={th}>Créée le</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} style={{ borderBottom:"1px solid #f1f5f9" }}>
                    <td style={td}>{nameById.get(t.customer_id) || t.customer_id}</td>
                    <td style={td}>{fmt(t.amount)}</td>
                    <td style={td}><span className="chip">{t.channel}</span></td>
                    <td style={td}>{t.currency}</td>
                    <td style={td}>{t.origin_country || "-"}</td>
                    <td style={td}>{t.destination_country || "-"}</td>
                    <td style={td}>{new Date(t.created_at).toLocaleString()}</td>
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

const th = { textAlign:"left", padding:"10px 12px", fontWeight:600, fontSize:13, color:"#374151" };
const td = { padding:"10px 12px", fontSize:14 };
