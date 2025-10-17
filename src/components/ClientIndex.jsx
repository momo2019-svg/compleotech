// src/components/ClientIndex.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase.js";

/**
 * Petit listing de clients avec numérotation et UUID
 * Props:
 *  - onPick?: (id: string) => void  -> callback quand on clique "Utiliser"
 *  - limit?: number                 -> nb de lignes (default 50)
 */
export default function ClientIndex({ onPick, limit = 50 }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function load() {
    setLoading(true);
    setErr("");
    try {
      // simple: derniers clients créés
      const { data, error } = await supabase
        .from("customers")
        .select("id,name,email")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      setErr(e.message || "Erreur lecture clients");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        (r.name || "").toLowerCase().includes(s) ||
        (r.email || "").toLowerCase().includes(s) ||
        String(r.id).toLowerCase().includes(s)
    );
  }, [q, rows]);

  function copy(text) {
    navigator.clipboard?.writeText(text);
  }

  return (
    <div className="card glass-edge" style={{ padding: 12 }}>
      <div className="mb-2 flex items-center gap-2" style={{ flexWrap: "wrap" }}>
        <b>Clients (dernier·e·s {limit})</b>
        <input
          className="input"
          placeholder="Filtrer par nom / email / UUID…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 280 }}
        />
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "Chargement…" : "Rafraîchir"}
        </button>
        {err && <span style={{ color: "#ef4444", fontSize: 12 }}>{err}</span>}
      </div>

      <div style={{ maxHeight: 260, overflow: "auto", border: "1px solid rgba(148,163,184,0.25)", borderRadius: 8 }}>
        <table style={{ width: "100%", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", background: "rgba(148,163,184,0.12)" }}>
              <th style={{ padding: "8px 10px", width: 50 }}>#</th>
              <th style={{ padding: "8px 10px" }}>Nom</th>
              <th style={{ padding: "8px 10px" }}>Email</th>
              <th style={{ padding: "8px 10px" }}>UUID</th>
              <th style={{ padding: "8px 10px", width: 160 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, idx) => (
              <tr key={r.id} style={{ borderTop: "1px solid rgba(148,163,184,0.18)" }}>
                <td style={{ padding: "8px 10px" }}>{idx + 1}</td>
                <td style={{ padding: "8px 10px" }}>{r.name || "—"}</td>
                <td style={{ padding: "8px 10px" }}>{r.email || "—"}</td>
                <td style={{ padding: "8px 10px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
                  {r.id}
                </td>
                <td style={{ padding: "8px 10px", display: "flex", gap: 6 }}>
                  <button className="btn" onClick={() => onPick?.(String(r.id))}>Utiliser</button>
                  <button className="btn" onClick={() => copy(String(r.id))}>Copier UUID</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 12, color: "#9ca3af" }}>
                  Aucun résultat.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
