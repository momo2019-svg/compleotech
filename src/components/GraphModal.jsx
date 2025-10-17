// src/components/GraphModal.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";

/* ====== Config Edge Functions ====== */
const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

/* ---------- Helpers de normalisation ---------- */
const norm = (arr) => (arr || []).map((s) => String(s).trim()).filter(Boolean);
const normUpper = (arr) => (arr || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean);
const toNullable = (arr, upper = false) => {
  const v = upper ? normUpper(arr) : norm(arr);
  return v.length ? v : null;
};

async function fetchGraph(payload) {
  const res = await fetch(`${FUNCTIONS_URL}/graph-analytics`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let j = {};
    try { j = await res.json(); } catch {}
    throw new Error(j.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ====== Force layout minimal (canvas) ====== */
function runLayout(nodes, links, { iters = 220, width = 980, height = 620 }) {
  const n = nodes.length;
  nodes.forEach((nd, i) => {
    if (nd.x == null) {
      const a = (i / Math.max(1, n)) * Math.PI * 2;
      nd.x = width / 2 + Math.cos(a) * 180;
      nd.y = height / 2 + Math.sin(a) * 180;
      nd.vx = 0; nd.vy = 0;
    }
  });
  const repulsion = 2000, springK = 0.002, springLen = 120, friction = 0.85;

  const idTo = new Map(nodes.map(n => [n.id, n]));
  for (let t = 0; t < iters; t++) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = a.x - b.x, dy = a.y - b.y, d2 = dx*dx + dy*dy + 0.01;
      const f = repulsion / d2, fx = f * dx, fy = f * dy;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
    for (const e of links) {
      const a = idTo.get(e.source), b = idTo.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 0.001;
      const diff = dist - springLen, f = springK * diff;
      const fx = (dx / dist) * f, fy = (dy / dist) * f;
      a.vx += fx; a.vy += fy; b.vx -= fx; b.vy -= fy;
    }
    for (const v of nodes) {
      v.vx *= friction; v.vy *= friction; v.x += v.vx; v.y += v.vy;
    }
  }
  return nodes;
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function CanvasGraph({ data, onNodeClick, getCanvasRef }) {
  const canvasRef = useRef(null);
  const [vp, setVp] = useState({ x: 0, y: 0, k: 1 });
  const [hoverId, setHoverId] = useState(null);
  const width = 980, height = 620;

  // expose canvas up (export PNG, etc.)
  useEffect(() => { getCanvasRef?.(canvasRef); }, [getCanvasRef]);

  const graph = useMemo(() => {
    const nodes = data.nodes.map(n => ({ ...n }));
    const links = data.links.map(l => ({ ...l }));
    runLayout(nodes, links, { width, height });
    return { nodes, links };
  }, [data]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.translate(vp.x, vp.y); ctx.scale(vp.k, vp.k);

    // liens
    ctx.globalAlpha = 0.6;
    for (const e of graph.links) {
      const a = graph.nodes.find(n => n.id === e.source);
      const b = graph.nodes.find(n => n.id === e.target);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.lineWidth = 1 + Math.log10((e.amount || 1)) * 0.7;
      ctx.strokeStyle = (e.corridor === "cross-border") ? "#f87171" : "#8b5cf6";
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // nœuds
    for (const nd of graph.nodes) {
      const r = 10 + (nd.risk ? nd.risk * 6 : 0);
      ctx.beginPath();
      ctx.fillStyle = nd.id === hoverId ? "#22d3ee" : (nd.risk > 0.7 ? "#ef4444" : "#60a5fa");
      ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.font = "11px ui-sans-serif, system-ui, -apple-system";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(nd.label || nd.id, nd.x + r + 4, nd.y + 4);
    }
    ctx.restore();
  }, [graph, vp, hoverId]);

  function world(p) { return { x: (p.x - vp.x) / vp.k, y: (p.y - vp.y) / vp.k }; }
  function pick(offsetX, offsetY) {
    const { x, y } = world({ x: offsetX, y: offsetY });
    for (let i = graph.nodes.length - 1; i >= 0; i--) {
      const nd = graph.nodes[i];
      const r = 10 + (nd.risk ? nd.risk * 6 : 0);
      const dx = x - nd.x, dy = y - nd.y;
      if (dx*dx + dy*dy <= r*r) return nd;
    }
    return null;
  }

  const drag = useRef(null);
  const onWheel = (e) => {
    e.preventDefault();
    const { offsetX, offsetY, deltaY } = e;
    const k = clamp(vp.k * (deltaY > 0 ? 0.9 : 1.1), 0.25, 4);
    const wx = (offsetX - vp.x) / vp.k, wy = (offsetY - vp.y) / vp.k;
    setVp({ k, x: offsetX - wx * k, y: offsetY - wy * k });
  };
  const onMouseDown = (e) => (drag.current = { x0: e.clientX, y0: e.clientY, vx0: vp.x, vy0: vp.y });
  const onMouseMove = (e) => {
    if (drag.current) {
      const dx = e.clientX - drag.current.x0, dy = e.clientY - drag.current.y0;
      setVp(v => ({ ...v, x: drag.current.vx0 + dx, y: drag.current.vy0 + dy }));
    } else {
      const nd = pick(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
      setHoverId(nd?.id ?? null);
    }
  };
  const onMouseUp = () => (drag.current = null);
  const onClick = (e) => { const nd = pick(e.nativeEvent.offsetX, e.nativeEvent.offsetY); if (nd) onNodeClick?.(nd); };

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="rounded-lg border border-white/10 bg-[#0b1220]"
      onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
      onMouseUp={onMouseUp} onClick={onClick}
    />
  );
}

/* ====== Modal ====== */
export default function GraphModal({ open, onClose, centerId, initialFilters }) {
  // ⚠️ on garde un objet initial stable
  const init = useMemo(() => ({
    depth: 1,
    direction: "ANY",          // UPPER
    min_amount: 0,
    entity_types: [],          // ["PERSON","BUSINESS"]
    entity_subtypes: [],       // raw text
    entity_status: [],         // raw text
    limit_per_neighbor: 50,
    ...(initialFilters || {}),
  }), [initialFilters]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [graph, setGraph] = useState(null);
  const [filters, setFilters] = useState(init);
  const canvasRefOut = useRef(null); // pour exporter PNG
  const getCanvasRef = (r) => (canvasRefOut.current = r?.current || null);

  // Normalise payload pour l'Edge Function / backend
  const payload = useMemo(() => {
    const direction = String(filters.direction || "ANY").toUpperCase();
    const entity_types = toNullable(filters.entity_types, true);   // UPPER
    const entity_subtypes = toNullable(filters.entity_subtypes);   // raw
    const entity_status = toNullable(filters.entity_status);       // raw
    return {
      center_id: String(centerId),
      depth: Number(filters.depth || 1),
      min_amount: Number(filters.min_amount || 0),
      direction,
      entity_types,
      entity_subtypes,
      entity_status,
      limit_per_neighbor: Number(filters.limit_per_neighbor || 50),
    };
  }, [centerId, filters]);

  async function load() {
    if (!open || !centerId) return;
    setLoading(true);
    setErr("");
    try {
      const json = await fetchGraph(payload);
      setGraph({
        nodes: (json.nodes || []).map(n => ({
          id: String(n.id),
          label: n.label ?? n.name ?? String(n.id),
          type: n.type ? String(n.type).toUpperCase() : null,
          subtype: n.subtype ?? null,
          status: n.status ?? null,
          risk: Number.isFinite(n.risk) ? n.risk : 0,
          pep: !!n.pep,
        })),
        links: (json.links || []).map(l => ({
          source: String(l.source),
          target: String(l.target),
          amount: Number(l.amount || 0),
          count: Number(l.count || 1),
          last_tx: l.last_tx ?? null,
          corridor: l.corridor ?? null,
        })),
      });
    } catch (e) {
      console.error(e);
      setErr(e.message || "Erreur lors du chargement du graphe.");
      setGraph(null);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [open, centerId, JSON.stringify(payload)]);

  const onNodeClick = (nd) => {
    // recalc centré sur le nœud cliqué
    const next = { ...filters, depth: 1 };
    setFilters(next);
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const p2 = { ...payload, center_id: String(nd.id), depth: 1 };
        const json = await fetchGraph(p2);
        setGraph({
          nodes: (json.nodes || []).map(n => ({
            id: String(n.id),
            label: n.label ?? n.name ?? String(n.id),
            type: n.type ? String(n.type).toUpperCase() : null,
            subtype: n.subtype ?? null,
            status: n.status ?? null,
            risk: Number.isFinite(n.risk) ? n.risk : 0,
            pep: !!n.pep,
          })),
          links: (json.links || []).map(l => ({
            source: String(l.source),
            target: String(l.target),
            amount: Number(l.amount || 0),
            count: Number(l.count || 1),
            last_tx: l.last_tx ?? null,
            corridor: l.corridor ?? null,
          })),
        });
      } catch (e) {
        console.error(e);
        setErr(e.message || "Erreur lors du recalcul.");
      } finally { setLoading(false); }
    })();
  };

  function exportPNG() {
    const c = canvasRefOut.current;
    if (!c) return;
    const link = document.createElement("a");
    link.download = "graph-modal.png";
    link.href = c.toDataURL("image/png");
    link.click();
  }

  // Raccourcis clavier (dans la modale)
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <style>{`@keyframes shimmer{from{background-position:0 0;}to{background-position:240px 0;}}`}</style>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-[1080px] bg-[#0b1220] text-[#e5e7eb] shadow-xl p-5 overflow-y-auto">
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-lg font-semibold">Analyse de graphe</h2>
          <div className="ml-auto flex items-center gap-2">
            <button className="px-3 py-1 rounded bg-slate-700/70 hover:bg-slate-600" onClick={exportPNG}>PNG</button>
            <button className="px-3 py-1 rounded bg-slate-700/70 hover:bg-slate-600" onClick={onClose}>Fermer</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm mb-3">
          <select
            value={filters.direction}
            onChange={e=>setFilters(f=>({...f, direction: String(e.target.value).toUpperCase()}))}
            className="bg-white/5 border border-white/10 rounded px-2 py-1"
          >
            <option value="ANY">Direction: Any</option>
            <option value="SENDING">Sending</option>
            <option value="RECEIVING">Receiving</option>
          </select>

          <label className="flex items-center gap-2">
            <span>Montant min</span>
            <input
              type="number"
              className="w-28 bg-white/5 border border-white/10 rounded px-2 py-1"
              value={filters.min_amount}
              onChange={e=>setFilters(f=>({...f, min_amount: Number(e.target.value||0)}))}
            />
          </label>

          <label className="flex items-center gap-2">
            <span>Profondeur</span>
            <select
              value={filters.depth}
              onChange={e=>setFilters(f=>({...f, depth: Number(e.target.value)}))}
              className="bg-white/5 border border-white/10 rounded px-2 py-1"
            >
              <option value={1}>1-hop</option>
              <option value={2}>2-hop</option>
            </select>
          </label>

          <button
            className="ml-auto px-3 py-1 rounded bg-indigo-500 hover:bg-indigo-600"
            onClick={()=>setFilters(f=>({...f}))}
          >
            {loading ? "Chargement…" : "Recalculer"}
          </button>
        </div>

        {err && (
          <div className="mb-3 text-sm text-red-300 bg-red-900/30 border border-red-500/30 rounded px-3 py-2">
            {err}
          </div>
        )}

        {!graph ? (
          <div className="relative h-[640px] rounded-lg border border-white/10 overflow-hidden">
            <div
              className="absolute inset-0"
              style={{
                background:
                  "repeating-linear-gradient(90deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.1) 120px, rgba(255,255,255,0.06) 240px)",
                animation: "shimmer 1.2s linear infinite",
                opacity: 0.7,
              }}
            />
            <div className="absolute inset-0 grid place-items-center text-sm opacity-80">
              Chargement du graphe…
            </div>
          </div>
        ) : (
          <>
            <div className="text-xs opacity-70 mb-2">
              {graph.nodes.length} nœuds • {graph.links.length} liens
            </div>
            <CanvasGraph data={graph} onNodeClick={onNodeClick} getCanvasRef={getCanvasRef}/>
          </>
        )}
      </div>
    </div>
  );
}
