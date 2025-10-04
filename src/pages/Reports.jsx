// src/pages/Reports.jsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase.js";

export default function Reports() {
  const [rows, setRows] = useState([]);
  const [sel, setSel] = useState(null); // rapport sélectionné
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from("reports")
      .select(`
        id, status, content, created_at, updated_at,
        alert:alerts(
          id, status, score, message, created_at,
          customer:customers(name),
          txn:transactions(amount, currency, channel, origin_country, destination_country)
        )
      `)
      .order("created_at", { ascending: false });
    if (!error) setRows(data || []);
  }

  useEffect(() => { load(); }, []);

  function open(r) { setSel(r); }

  async function save() {
    if (!sel) return;
    setSaving(true);
    const { error } = await supabase
      .from("reports")
      .update({ content: sel.content, status: sel.status })
      .eq("id", sel.id);
    setSaving(false);
    if (!error) load();
  }

  function downloadMD() {
    if (!sel) return;
    const blob = new Blob([sel.content || ""], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `report_${sel.id}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <div className="card hdr">Rapports</div>
      <div className="card body" style={{ display:"grid", gridTemplateColumns:"320px 1fr", gap:12 }}>
        {/* Liste */}
        <div className="card" style={{ overflow:"auto", maxHeight: "70vh" }}>
          <div className="card hdr">Tous les rapports</div>
          <div className="card body" style={{ padding:0 }}>
            {rows.length === 0 ? (
              <div style={{ padding:12, color:"#6b7280" }}>Aucun rapport</div>
            ) : rows.map(r => (
              <button
                key={r.id}
                className="dd-item-btn"
                style={{ width:"100%", textAlign:"left" }}
                onClick={() => open(r)}
              >
                <div style={{ fontWeight:600 }}>
                  {r.alert?.customer?.name || "Client"} — {r.alert?.message || "Alerte"}
                </div>
                <div style={{ fontSize:12, color:"#6b7280" }}>
                  {new Date(r.created_at).toLocaleString()} · {r.status}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Édition */}
        <div className="card" style={{ minHeight: 400 }}>
          <div className="card hdr" style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span>Édition du rapport</span>
            {sel && (
              <div style={{ display:"flex", gap:8 }}>
                <select
                  className="select"
                  value={sel.status}
                  onChange={(e) => setSel({ ...sel, status: e.target.value })}
                >
                  <option value="DRAFT">DRAFT</option>
                  <option value="REVIEWED">REVIEWED</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
                <button className="btn" onClick={downloadMD}>Exporter .md</button>
                <button className="btn" onClick={save} disabled={saving}>{saving ? "…" : "Enregistrer"}</button>
              </div>
            )}
          </div>

          <div className="card body" style={{ display:"grid", gap:10 }}>
            {!sel ? (
              <div style={{ color:"#6b7280" }}>Sélectionne un rapport à gauche…</div>
            ) : (
              <>
                {/* Infos alerte */}
                <div style={{ fontSize:14, background:"#f9fafb", padding:10, borderRadius:8 }}>
                  <b>Client:</b> {sel.alert?.customer?.name || "-"} ·
                  <b> Alerte:</b> {sel.alert?.message || "-"} (score {sel.alert?.score ?? "-"}) ·
                  <b> Txn:</b> {sel.alert?.txn ? `${sel.alert.txn.amount} ${sel.alert.txn.currency} · ${sel.alert.txn.channel}` : "-"}
                </div>

                {/* Éditeur markdown simple */}
                <textarea
                  value={sel.content || ""}
                  onChange={(e) => setSel({ ...sel, content: e.target.value })}
                  style={{ width:"100%", minHeight: 380, fontFamily:"ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
