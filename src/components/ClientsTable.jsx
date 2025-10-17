// src/components/ClientsTable.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase.js";

function RiskChip({ level }) {
  const cls =
    level === "HIGH" ? "chip open" :
    level === "MEDIUM" ? "chip review" :
    "chip closed";
  return <span className={cls} title={`Risque ${level || "-"}`}>{level || "-"}</span>;
}

export default function ClientsTable() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [search, setSearch] = useState("");

  async function fetchRows() {
    setErr("");
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, email, country, risk_level, pep, created_at")
      .order("created_at", { ascending: false });
    if (error) setErr(error.message);
    setRows(data || []);
    setLoading(false);
  }

  useEffect(() => {
    fetchRows();
    const ch = supabase
      .channel("rt-customers-table")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, fetchRows)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.name || "").toLowerCase().includes(q) ||
      (r.email || "").toLowerCase().includes(q) ||
      (r.country || "").toLowerCase().includes(q) ||
      (r.risk_level || "").toLowerCase().includes(q) ||
      (r.id || "").toLowerCase().includes(q)        // ← recherche par UUID
    );
  }, [rows, search]);

  async function remove(id) {
    if (!confirm("Supprimer ce client ? (Transactions/alertes liées supprimées)")) return;
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) return alert(error.message);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  if (loading) return <div className="card body">Chargement…</div>;
  if (err) return <div className="card body" style={{ color: "#b91c1c" }}>{err}</div>;

  return (
    <div className="card">
      <div className="card hdr" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div>Clients ({filtered.length})</div>
        <input
          className="search"
          placeholder="Rechercher… (nom, email, pays, risque, UUID)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 360 }}
        />
      </div>

      <div className="card body" style={{ padding: 0, overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Pays</th>
              <th>Risque</th>
              <th>PEP</th>
              <th>Créé le</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8", display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                    <code style={{ userSelect: "all" }}>{r.id}</code>
                    <button
                      className="btn"
                      style={{ padding: "2px 6px", fontSize: 12 }}
                      onClick={() => copy(r.id)}
                      title="Copier l'UUID"
                    >
                      📋 Copier
                    </button>
                    <a
                      className="btn"
                      style={{ padding: "2px 6px", fontSize: 12 }}
                      href={`/graph?center=${encodeURIComponent(r.id)}`}
                      title="Ouvrir le graphe centré sur ce client"
                    >
                      Centrer
                    </a>
                  </div>
                </td>
                <td>{r.email}</td>
                <td>{r.country || "-"}</td>
                <td><RiskChip level={r.risk_level} /></td>
                <td>
                  <span
                    className={"chip " + (r.pep ? "open" : "closed")}
                    title={r.pep ? "Politically Exposed Person" : "Non PEP"}
                  >
                    {r.pep ? "Oui" : "Non"}
                  </span>
                </td>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <button className="btn" onClick={() => remove(r.id)}>Supprimer</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ color: "#6b7280", padding: 12, textAlign: "center" }}>
                  Aucun client
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
