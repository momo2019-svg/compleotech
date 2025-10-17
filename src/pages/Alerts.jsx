// src/pages/Alerts.jsx
import { useEffect, useMemo, useState, useCallback } from "react";
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Préférence : vue "v_alert_features" (avec alert_id / customer), sinon fallback table "alerts"
      let q = supabase
        .from("v_alert_features")
        .select("*")
        .order("created_at", { ascending: false });

      if (statusFilter !== "ALL") q = q.eq("status", statusFilter);

      const { data, error } = await q;

      if (error) {
        // Fallback table
        let q2 = supabase
          .from("alerts")
          .select("id,customer_id,score,message,transaction_id,status,created_at")
          .order("created_at", { ascending: false });
        if (statusFilter !== "ALL") q2 = q2.eq("status", statusFilter);

        const { data: d2, error: e2 } = await q2;
        if (e2) {
          console.error("alerts load error:", e2);
          setRows([]);
        } else {
          setRows(
            (d2 ?? []).map((r) => ({
              id: r.id,
              customer: { name: r.customer_id || "-" },
              score: r.score,
              message: r.message,
              transaction_id: r.transaction_id ?? null,
              status: r.status,
              created_at: r.created_at,
            }))
          );
        }
      } else {
        setRows(
          (data ?? []).map((r) => ({
            id: r.alert_id ?? r.id,
            customer: { name: r.customer ?? "-" },
            score: r.score,
            message: r.message,
            transaction_id: r.transaction_id ?? null,
            status: r.status,
            created_at: r.created_at,
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
    // Rafraîchissement live sur alerts + alert_transactions
    const ch = supabase
      .channel("alerts-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "alert_transactions" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  // Avancement de statut via RPC (audit) avec fallback update direct
  async function advanceStatus(a) {
    const next = { OPEN: "UNDER_REVIEW", UNDER_REVIEW: "CLOSED", CLOSED: "CLOSED" };
    const to = next[a.status] || a.status;

    const { error: rpcErr } = await supabase.rpc("set_alert_status", {
      p_alert_id: a.id,
      p_new_status: to,
      p_note: null,
      p_assignee: null,
    });

    if (rpcErr) {
      const { error: updErr } = await supabase
        .from("alerts")
        .update({ status: to })
        .eq("id", a.id);
      if (updErr) {
        alert("Échec mise à jour : " + updErr.message);
        return;
      }
    }
    load();
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      const name = (r.customer?.name || "").toLowerCase();
      const msg = (r.message || "").toLowerCase();
      const tx = String(r.transaction_id || "").toLowerCase();
      return name.includes(term) || msg.includes(term) || tx.includes(term);
    });
  }, [rows, search]);

  return (
    <div className="page-wrap" style={{ display: "grid", gap: 16 }}>
      <div className="card">
        <div
          className="card hdr"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
        >
          <span>Alertes</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select
              className="select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">Tous statuts</option>
              <option value="OPEN">OPEN</option>
              <option value="UNDER_REVIEW">UNDER_REVIEW</option>
              <option value="CLOSED">CLOSED</option>
            </select>

            <input
              className="select"
              placeholder="Rechercher (client, message, tx)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: 280 }}
            />

            <button className="btn" onClick={load} disabled={loading}>
              {loading ? "…" : "Rafraîchir"}
            </button>
          </div>
        </div>

        <div className="card body table-wrap" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Client</th>
                <th>Score</th>
                <th>Message</th>
                <th>Transaction</th>
                <th>Statut</th>
                <th>Créé le</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 14, textAlign: "center", color: "#9ca3af" }}>
                    {loading ? "Chargement…" : "Aucune alerte"}
                  </td>
                </tr>
              )}

              {filtered.map((a) => (
                <tr key={a.id}>
                  <td>{a.customer?.name || "-"}</td>
                  <td>{a.score ?? "-"}</td>
                  <td>{a.message || "-"}</td>
                  <td>{a.transaction_id ? a.transaction_id : "-"}</td>
                  <td><StatusChip status={a.status} /></td>
                  <td>{new Date(a.created_at).toLocaleString()}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <Link to={`/alerts/${a.id}`} className="btn" style={{ marginRight: 8 }}>
                      Ouvrir
                    </Link>
                    {a.status !== "CLOSED" && (
                      <button className="btn primary" onClick={() => advanceStatus(a)}>
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