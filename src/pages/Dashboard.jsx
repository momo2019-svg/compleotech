// src/pages/Dashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase.js";
import {
  ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend
} from "recharts";

// === Helpers ===
const fmtDay = (d) => new Date(d).toISOString().slice(0,10);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const RANGES = [
  { key:"7d",  label:"7j",   days:7  },
  { key:"30d", label:"30j",  days:30 },
  { key:"90d", label:"90j",  days:90 },
  { key:"all", label:"Tout", days:null },
];
const CHANNELS = ["ALL","CARD","CASH","CRYPTO","WIRE","ACH"];

const C = {
  stroke: "#93c5fd",
  fill1: "#60a5fa",
  grid: "#334155",
  barOpen: "#f87171",
  barReview: "#fbbf24",
  barClosed: "#34d399",
  pie: ["#60a5fa", "#a78bfa", "#f472b6", "#22d3ee", "#f59e0b"]
};

// CSV helpers
const csvEscape = (v) => {
  if (v == null) return "";
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
};
function buildCSV(dailySeries, alertBars, channelPie, topCustomers){
  const out = [];
  out.push("Daily Volume");
  out.push("day,amount");
  dailySeries.forEach(r => out.push(`${csvEscape(r.day)},${csvEscape(r.amount)}`));
  out.push("");
  out.push("Alerts Distribution");
  out.push("status,count");
  alertBars.forEach(r => out.push(`${csvEscape(r.status)},${csvEscape(r.value)}`));
  out.push("");
  out.push("Channel Distribution");
  out.push("channel,count");
  channelPie.forEach(r => out.push(`${csvEscape(r.name)},${csvEscape(r.value)}`));
  out.push("");
  out.push("Top Customers");
  out.push("name,transactions,total");
  topCustomers.forEach(r => out.push(`${csvEscape(r.name)},${csvEscape(r.count)},${csvEscape(r.total)}`));
  return out.join("\n");
}
function download(text, filename="dashboard.csv"){
  const blob = new Blob([text], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function Dashboard() {
  const [range, setRange] = useState("30d");
  const [channel, setChannel] = useState("ALL");
  const [loading, setLoading] = useState(true);

  const [kpi, setKpi] = useState({ customers:0, transactions:0, alertsOpen:0, volumeUSD:0 });
  const [tx, setTx] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [names, setNames] = useState(new Map());

  const dateFrom = useMemo(() => {
    if (range === "all") return null;
    const d = new Date(); d.setHours(0,0,0,0);
    return addDays(d, -RANGES.find(r => r.key===range).days).toISOString();
  }, [range]);

  async function load() {
    setLoading(true);

    const { data: custs=[] } = await supabase.from("customers").select("id,name");
    const nameMap = new Map(custs.map(c=>[c.id, c.name]));
    setNames(nameMap);

    const [{count:c1},{count:c2},{count:c3}] = await Promise.all([
      supabase.from("customers").select("id",{count:"exact", head:true}),
      supabase.from("transactions").select("id",{count:"exact", head:true}),
      supabase.from("alerts").select("id",{count:"exact", head:true}).in("status",["OPEN","UNDER_REVIEW"]),
    ]);

    let qTx = supabase
      .from("transactions")
      .select("id, customer_id, amount, currency, channel, origin_country, destination_country, created_at")
      .order("created_at",{ascending:true});
    if (dateFrom) qTx = qTx.gte("created_at", dateFrom);
    if (channel!=="ALL") qTx = qTx.eq("channel", channel);
    const { data:txData=[] } = await qTx;

    let qAl = supabase
      .from("alerts")
      .select("id,status,score,created_at")
      .order("created_at",{ascending:true});
    if (dateFrom) qAl = qAl.gte("created_at", dateFrom);
    const { data:alData=[] } = await qAl;

    const vol = txData.reduce((s,t)=> s + Number(t.amount||0), 0);

    setKpi({ customers:c1||0, transactions:c2||0, alertsOpen:c3||0, volumeUSD:vol });
    setTx(txData); setAlerts(alData);
    setLoading(false);
  }

  useEffect(()=>{ load(); }, [range, channel]);

  useEffect(()=>{
    const ch1 = supabase.channel("dash-tx").on("postgres_changes",{event:"*",schema:"public",table:"transactions"},load).subscribe();
    const ch2 = supabase.channel("dash-al").on("postgres_changes",{event:"*",schema:"public",table:"alerts"},load).subscribe();
    const ch3 = supabase.channel("dash-cust").on("postgres_changes",{event:"*",schema:"public",table:"customers"},load).subscribe();
    return ()=>{ supabase.removeChannel(ch1); supabase.removeChannel(ch2); supabase.removeChannel(ch3); };
  },[]);

  // === Séries ===
  const dailySeries = useMemo(()=>{
    const m = new Map();
    if (dateFrom) {
      const start = new Date(dateFrom); const end = new Date(); end.setHours(0,0,0,0);
      for (let d=new Date(start); d<=end; d=addDays(d,1)) m.set(fmtDay(d),0);
    }
    tx.forEach(t=>{
      const k = fmtDay(t.created_at);
      m.set(k, (m.get(k)||0) + Number(t.amount||0));
    });
    if (m.size===0 && tx.length>0 && range==="all") {
      const tmp = tx.reduce((acc,t)=>{ const k=fmtDay(t.created_at); acc[k]=(acc[k]||0)+Number(t.amount||0); return acc; },{});
      return Object.entries(tmp).sort((a,b)=>a[0].localeCompare(b[0])).map(([day,amount])=>({day,amount}));
    }
    return [...m.entries()].map(([day,amount])=>({day,amount}));
  },[tx,range,dateFrom]);

  const alertBars = useMemo(()=>{
    const b = { OPEN:0, UNDER_REVIEW:0, CLOSED:0 };
    alerts.forEach(a => { b[a.status] = (b[a.status]||0) + 1; });
    return [
      { status:"OPEN", value:b.OPEN||0 },
      { status:"UNDER_REVIEW", value:b.UNDER_REVIEW||0 },
      { status:"CLOSED", value:b.CLOSED||0 },
    ];
  },[alerts]);

  const channelPie = useMemo(()=>{
    const m = new Map();
    tx.forEach(t=> m.set(t.channel, (m.get(t.channel)||0)+1));
    return [...m.entries()].map(([name,value])=>({name,value})).sort((a,b)=> b.value - a.value);
  },[tx]);

  const topCustomers = useMemo(()=>{
    const m = new Map();
    tx.forEach(t=>{
      const cur = m.get(t.customer_id) || { total:0, count:0 };
      cur.total += Number(t.amount||0);
      cur.count += 1;
      m.set(t.customer_id, cur);
    });
    return [...m.entries()]
      .map(([id,{total,count}])=>({ id, name: names.get(id) || id, total, count }))
      .sort((a,b)=> b.total - a.total).slice(0,5);
  },[tx,names]);

  // Export
  function exportCSV(){
    const csv = buildCSV(dailySeries, alertBars, channelPie, topCustomers);
    const stamp = new Date().toISOString().slice(0,10);
    download(csv, `dashboard_${stamp}.csv`);
  }

  return (
    <div>
      {/* KPI */}
      <div className="kpis">
        <div className="card kpi"><div className="kpi-label">Clients</div><div className="kpi-value">{kpi.customers}</div></div>
        <div className="card kpi"><div className="kpi-label">Transactions</div><div className="kpi-value">{kpi.transactions}</div></div>
        <div className="card kpi"><div className="kpi-label">Alertes ouvertes</div><div className="kpi-value">{kpi.alertsOpen}</div></div>
        <div className="card kpi"><div className="kpi-label">Volume (USD)</div><div className="kpi-value">{kpi.volumeUSD.toLocaleString()}</div></div>
      </div>

      {/* Filtres + Export */}
      <div className="toolbar" style={{ justifyContent:"space-between" }}>
        <div className="btn-group">
          {RANGES.map(r=>(
            <button key={r.key} className={"btn"+(range===r.key?" active": "")} onClick={()=>setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <select className="select" value={channel} onChange={e=>setChannel(e.target.value)}>
            {CHANNELS.map(ch=><option key={ch} value={ch}>{ch}</option>)}
          </select>
          <button className="btn" onClick={exportCSV}>Exporter CSV</button>
        </div>
      </div>

      {/* Graph 1 */}
      <div className="card">
        <div className="card hdr">Volume des transactions</div>
        <div className="card body" style={{height:320}}>
          <ResponsiveContainer>
            <AreaChart data={dailySeries}>
              <defs>
                <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.fill1} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={C.fill1} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
              <XAxis dataKey="day" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip formatter={(v)=>`${Number(v).toLocaleString()} USD`} contentStyle={{ background:"#111827", border:"1px solid #374151" }} />
              <Area type="monotone" dataKey="amount" stroke="#93c5fd" fill="url(#areaFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Graphs 2 & 3 */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <div className="card">
          <div className="card hdr">Répartition des alertes</div>
          <div className="card body" style={{height:280}}>
            <ResponsiveContainer>
              <BarChart data={alertBars}>
                <CartesianGrid stroke={C.grid} strokeDasharray="3 3" />
                <XAxis dataKey="status" stroke="#9ca3af" />
                <YAxis allowDecimals={false} stroke="#9ca3af" />
                <Tooltip contentStyle={{ background:"#111827", border:"1px solid #374151" }} />
                <Bar dataKey="value">
                  <Cell key="OPEN" fill={C.barOpen} />
                  <Cell key="UNDER_REVIEW" fill={C.barReview} />
                  <Cell key="CLOSED" fill={C.barClosed} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card hdr">Transactions par canal</div>
          <div className="card body" style={{height:280}}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={channelPie} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2} label>
                  {channelPie.map((_, i) => (<Cell key={i} fill={C.pie[i % C.pie.length]} />))}
                </Pie>
                <Legend />
                <Tooltip contentStyle={{ background:"#111827", border:"1px solid #374151" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top clients */}
      <div className="card">
        <div className="card hdr">Top clients (par volume)</div>
        <div className="card body" style={{ padding:0 }}>
          {topCustomers.length === 0 ? (
            <div style={{ padding:12, color:"#6b7280" }}>Aucune donnée.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Transactions</th>
                  <th>Volume (USD)</th>
                </tr>
              </thead>
              <tbody>
                {topCustomers.map(r=>(
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.count}</td>
                    <td>{r.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {loading && <div style={{opacity:.6,fontSize:13}}>Mise à jour…</div>}
    </div>
  );
}
