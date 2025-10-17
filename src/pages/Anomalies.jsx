// src/pages/Anomalies.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase.js";

function toCSV(rows) {
  const head = ["id","customer_id","amount","currency","created_at","risk_score","risk_factors"];
  const lines = [head.join(",")];
  for (const r of rows) {
    const vals = [
      r.id,
      r.customer_id,
      Number(r.amount||0),
      r.currency || "",
      r.created_at ? new Date(r.created_at).toISOString() : "",
      Math.round(Number(r.risk_score||0)),
      JSON.stringify(r.risk_factors || {})
    ];
    lines.push(vals.map(v => {
      const s = String(v).replace(/"/g,'""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    }).join(","));
  }
  return lines.join("\n");
}
function download(text, name="anomalies.csv"){
  const blob = new Blob([text], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function Anomalies() {
  const [rows, setRows] = useState([]);
  const [minScore, setMinScore] = useState(60);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data = [], error } = await supabase
      .from("transactions")
      .select("id,customer_id,amount,currency,created_at,risk_score,risk_factors")
      .gte("risk_score", minScore)
      .order("risk_score", { ascending:false })
      .limit(500);
    if (!error) setRows(data);
    setLoading(false);
  }

  useEffect(()=>{ load(); }, [minScore]);

  const filtered = useMemo(()=>{
    if (!q.trim()) return rows;
    const s = q.trim().toLowerCase();
    return rows.filter(r =>
      (r.id ?? "").toLowerCase().includes(s) ||
      (r.customer_id ?? "").toLowerCase().includes(s)
    );
  }, [rows, q]);

  return (
    <div className="page-wrap">
      <div className="card hdr" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{fontWeight:700, fontSize:16}}>Anomalies (transactions à haut score)</div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input
            className="input"
            placeholder="Rechercher (tx / client)…"
            value={q}
            onChange={e=>setQ(e.target.value)}
            style={{width:260}}
          />
          <label style={{opacity:.8,fontSize:13}}>Score min.</label>
          <input
            className="input"
            type="number" min={0} max={100}
            value={minScore}
            onChange={e=>setMinScore(Math.max(0, Math.min(100, Number(e.target.value)||0)))}
            style={{width:100}}
          />
          <button className="btn" onClick={load}>Rafraîchir</button>
          <button className="btn primary" onClick={()=>download(toCSV(filtered))}>Exporter CSV</button>
        </div>
      </div>

      <div className="card body table-wrap" style={{padding:0}}>
        {loading ? (
          <div style={{ padding:16, color:"#9aa3b2" }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:16, color:"#9aa3b2" }}>Aucune transaction au-dessus du seuil.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{width:90}}>Score</th>
                <th>Tx</th>
                <th>Client</th>
                <th>Montant</th>
                <th>Date</th>
                <th style={{width:420}}>Facteurs (explicabilité)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r=>(
                <tr key={r.id}>
                  <td style={{fontWeight:800}}>{Math.round(r.risk_score)}</td>
                  <td><code>{r.id}</code></td>
                  <td><code>{r.customer_id}</code></td>
                  <td>{Number(r.amount||0).toLocaleString()} {r.currency}</td>
                  <td>{r.created_at ? new Date(r.created_at).toLocaleString("fr-FR") : ""}</td>
                  <td>
                    <code style={{fontSize:12}}>
                      {JSON.stringify(r.risk_factors || {})}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
