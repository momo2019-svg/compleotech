// src/pages/Hubs.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase.js";

function toCSV(rows) {
  const head = ["node_id","label","degree","total_amount","flagged_at"];
  const lines = [head.join(",")];
  for (const r of rows) {
    const vals = [
      r.node_id ?? "",
      (r.label ?? r.node_id ?? "").toString().replace(/"/g,'""'),
      r.degree ?? 0,
      Number(r.total_amount || 0),
      r.flagged_at ? new Date(r.flagged_at).toISOString() : ""
    ];
    lines.push(vals.map(v => /[",\n]/.test(String(v)) ? `"${v}"` : v).join(","));
  }
  return lines.join("\n");
}
function download(text, name="hubs.csv"){
  const blob = new Blob([text], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function Hubs() {
  const [minDegree, setMinDegree] = useState(3);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  async function load() {
    setLoading(true);
    // Si tu as créé la vue graph_hubs_v, remplace "graph_flags" par "graph_hubs_v"
    const { data = [], error } = await supabase
      .from("graph_hubs_v") // ← mets "graph_flags" si tu n'as pas créé la vue
      .select("*")
      .gte("degree", minDegree)
      .order("degree", { ascending: false })
      .order("total_amount", { ascending: false })
      .limit(500);
    if (!error) setRows(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, [minDegree]);

  const filtered = useMemo(()=>{
    if (!q.trim()) return rows;
    const s = q.trim().toLowerCase();
    return rows.filter(r =>
      (r.label ?? "").toLowerCase().includes(s) ||
      (r.node_id ?? "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  return (
    <div className="page-wrap">
      {/* Header / filtres */}
      <div className="card hdr" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontWeight:700, fontSize:16}}>Hubs (analyse graphe)</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input
            className="input"
            placeholder="Rechercher (label / node)…"
            value={q}
            onChange={e=>setQ(e.target.value)}
            style={{width:260}}
          />
          <label style={{opacity:.8,fontSize:13}}>Degré min.</label>
          <input
            className="input"
            type="number" min={1}
            value={minDegree}
            onChange={e=>setMinDegree(Math.max(1, Number(e.target.value)||1))}
            style={{width:90}}
          />
          <button className="btn" onClick={load}>Rafraîchir</button>
          <button className="btn primary" onClick={()=>download(toCSV(filtered))}>Exporter CSV</button>
        </div>
      </div>

      {/* Table */}
      <div className="card body table-wrap" style={{padding:0}}>
        {loading ? (
          <div style={{ padding:16, color:"#9aa3b2" }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:16, color:"#9aa3b2" }}>Aucun hub ne correspond.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{width:420}}>Label</th>
                <th>Node</th>
                <th>Degré</th>
                <th>Total (USD)</th>
                <th>Flaggé le</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r,i)=>(
                <tr key={`${r.node_id}-${r.flagged_at}-${i}`}>
                  <td style={{fontWeight:600}}>{r.label ?? r.node_id}</td>
                  <td style={{opacity:.9}}><code>{r.node_id}</code></td>
                  <td style={{fontWeight:700}}>{r.degree}</td>
                  <td>{Number(r.total_amount||0).toLocaleString()}</td>
                  <td>{r.flagged_at ? new Date(r.flagged_at).toLocaleString("fr-FR") : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
