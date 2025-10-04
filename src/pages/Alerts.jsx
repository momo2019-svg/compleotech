// src/pages/Alerts.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase.js";

function StatusChip({ status }) {
  const cls =
    status === "OPEN" ? "chip open" :
    status === "UNDER_REVIEW" ? "chip review" :
    "chip closed";
  return <span className={cls}>{status}</span>;
}

export default function Alerts() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  useEffect(() => {
    load();
    // On écoute les changements sur alerts ET alert_transactions pour rafraîchir la vue
    const ch = supabase
      .channel("alerts-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "alert_transactions" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    let q = supabase
      .from("v_alert_features")
      .select("*")
      .order("created_at", { ascending: false });

    if (statusFilter !== "ALL") q = q.eq("status", statusFilter);

    const { data, error } = await q;
    if (error) {
      console.error("alerts load error:", error);
      setRows([]);
    } else {
      // Normalisation pour coller au rendu existant
      const rows = (data ?? []).map(r => ({
        id: r.alert_id ?? r.id,             // la vue expose alert_id
        customer: { name: r.customer ?? "-" },
        score: r.score,
        message: r.message,
        transaction_id: r.transaction_id ?? null,
        status: r.status,
        created_at: r.created_at
      }));
      setRows(rows);
    }
    setLoading(false);
  }

  async function advanceStatus(a) {
    const next = { OPEN: "UNDER_REVIEW", UNDER_REVIEW: "CLOSED", CLOSED: "CLOSED" };
    const to = next[a.status] || a.status;
    const { error } = await supabase.from("alerts").update({ status: to }).eq("id", a.id);
    if (!error) load();
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      const matchSearch = term
        ? (r.customer?.name || "").toLowerCase().includes(term) ||
          (r.message || "").toLowerCase().includes(term)
        : true;
      return matchSearch;
    });
  }, [rows, search]);

  return (
    <div>
      <div className="card">
        <div className="card hdr" style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
          <span>Alertes</span>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <select
              className="btn"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); load(); }}
            >
              <option value="ALL">Tous statuts</option>
              <option value="OPEN">OPEN</option>
              <option value="UNDER_REVIEW">UNDER_REVIEW</option>
              <option value="CLOSED">CLOSED</option>
            </select>

            <input
              className="search"
              placeholder="Rechercher (client, message)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 320 }}
            />

            <button className="btn" onClick={load} disabled={loading}>
              {loading ? "…" : "Rafraîchir"}
            </button>
          </div>
        </div>

        <div className="card body" style={{ padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={th}>Client</th>
                <th style={th}>Score</th>
                <th style={th}>Message</th>
                <th style={th}>Transaction</th>
                <th style={th}>Statut</th>
                <th style={th}>Créé le</th>
                <th style={th}></th>
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 14, textAlign: "center", color: "#6b7280" }}>
                    {loading ? "Chargement…" : "Aucune alerte"}
                  </td>
                </tr>
              )}

              {filtered.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={td}>{a.customer?.name || "-"}</td>
                  <td style={td}>{a.score ?? "-"}</td>
                  <td style={td}>{a.message || "-"}</td>
                  <td style={td}>
                    {a.transaction_id ? a.transaction_id : "-"}
                  </td>
                  <td style={td}><StatusChip status={a.status} /></td>
                  <td style={td}>{new Date(a.created_at).toLocaleString()}</td>
                  <td style={{ ...td, textAlign: "right", whiteSpace:"nowrap" }}>
                    <Link to={`/alerts/${a.id}`} className="btn" style={{ marginRight: 8 }}>
                      Ouvrir
                    </Link>
                    {a.status !== "CLOSED" && (
                      <button className="btn btn--brand" onClick={() => advanceStatus(a)}>
                        Avancer le statut
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
}

const th = { textAlign: "left", padding: "10px 12px", fontWeight: 600, fontSize: 13, color: "#374151" };
const td = { padding: "10px 12px", fontSize: 14 };
