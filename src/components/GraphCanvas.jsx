// src/components/GraphCanvas.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase.js";

/**
 * Props:
 * - centerId: string (UUID client)
 * - initialFilters: { depth: number, min_amount: number }
 *
 * Attendu côté RPC get_graph_ui:
 *   nodes: [{ id, label?, type? ('PERSON'|'BUSINESS'|'ACCOUNT'|...), risk? }]
 *   links: [{ source, target, amount?, count?, channel? ('CARD'|'WIRE'|'CRYPTO'|'CASH'|'ACH') }]
 */
export default function GraphCanvas({ centerId, initialFilters }) {
  /* ------------ state ------------- */
  const [minAmount, setMinAmount] = useState(initialFilters?.min_amount ?? 0);
  const [depth, setDepth] = useState(initialFilters?.depth ?? 1);

  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // viewport & UX
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState(null);
  const [focusId, setFocusId] = useState(null);

  /* ------------ fetch ------------- */
  async function load() {
    if (!centerId) return;
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase.rpc("get_graph_ui", {
        center: String(centerId),
        depth: depth,
        min_amount: Number(minAmount || 0),
      });
      if (error) throw error;

      const nn = (data?.nodes ?? []).map((n) => ({
        id: String(n.id),
        label: String(n.label ?? n.id),
        type: (n.type || "PERSON").toUpperCase(),
        risk: Number(n.risk ?? 0),
      }));
      const ll = (data?.links ?? []).map((l) => ({
        source: String(l.source),
        target: String(l.target),
        amount: Number(l.amount ?? 0),
        count: Number(l.count ?? 1),
        channel: (l.channel || "").toUpperCase(), // CARD/WIRE/CRYPTO/CASH/ACH/…
      }));

      setNodes(nn);
      setLinks(ll);
      requestAnimationFrame(() => fitView(nn));
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Erreur RPC get_graph_ui");
      setNodes([]);
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerId, depth, minAmount]);

  /* ------------ layout étoile ------------- */
  const layout = useMemo(() => {
    if (nodes.length === 0)
      return { pos: new Map(), bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };

    const center =
      nodes.find((n) => n.id === String(centerId)) ??
      nodes[0];

    const others = nodes.filter((n) => n.id !== center.id);
    const pos = new Map();

    const cx = 0,
      cy = 0;
    pos.set(center.id, {
      x: cx,
      y: cy,
      r: center.type === "ACCOUNT" ? 16 : 18,
    });

    const R = Math.max(160, Math.min(420, 110 + others.length * 20));
    const step = (2 * Math.PI) / Math.max(1, others.length);
    others.forEach((n, i) => {
      const a = i * step;
      const x = cx + R * Math.cos(a);
      const y = cy + R * Math.sin(a);
      pos.set(n.id, { x, y, r: n.type === "ACCOUNT" ? 16 : 18 });
    });

    let minX = 0,
      minY = 0,
      maxX = 0,
      maxY = 0;
    pos.forEach((p) => {
      minX = Math.min(minX, p.x - 48);
      maxX = Math.max(maxX, p.x + 48);
      minY = Math.min(minY, p.y - 48);
      maxY = Math.max(maxY, p.y + 48);
    });

    return { pos, bbox: { minX, minY, maxX, maxY } };
  }, [nodes, centerId]);

  function fitView(nn = nodes) {
    const wrap = wrapRef.current;
    const cvs = canvasRef.current;
    if (!wrap || !cvs || nn.length === 0) return;

    const { width, height } = wrap.getBoundingClientRect();
    cvs.width = width;
    cvs.height = height;

    const { bbox } = layout;
    const w = bbox.maxX - bbox.minX || 1;
    const h = bbox.maxY - bbox.minY || 1;
    const pad = 60;

    const scale = Math.min((width - pad) / w, (height - pad) / h);
    setZoom(Math.max(0.25, Math.min(2.4, scale)));
    setOffset({
      x: width / 2 - ((bbox.minX + bbox.maxX) / 2) * scale,
      y: height / 2 - ((bbox.minY + bbox.maxY) / 2) * scale,
    });
  }

  /* ------------ palettes / pictos ------------- */
  const NODE_FILL = (n) => {
    if (n.id === String(centerId)) return "#ef4444";
    switch (n.type) {
      case "ACCOUNT":
      case "WALLET":
        return "#60a5fa"; // bleu (carte/compte)
      case "BUSINESS":
        return "#34d399"; // vert
      case "PERSON":
      default:
        return "#14b8a6"; // teal
    }
  };

  const EDGE_CLR = (ch) => {
    switch (ch) {
      case "CARD":
        return "rgba(124,58,237,0.7)"; // violet
      case "WIRE":
        return "rgba(249,115,22,0.7)"; // orange
      case "CRYPTO":
        return "rgba(34,211,238,0.75)"; // cyan
      case "CASH":
        return "rgba(107,114,128,0.7)"; // gris
      case "ACH":
        return "rgba(34,197,94,0.7)"; // vert
      default:
        return "rgba(99,102,241,0.6)"; // indigo
    }
  };

  // pictogrammes simples (personne / carte) en vectoriel
  function drawGlyph(ctx, type, x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,0.1)";
    ctx.lineWidth = 1;

    if (type === "ACCOUNT" || type === "WALLET") {
      // petite carte
      const w = r * 1.5,
        h = r * 1.0;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 3);
      ctx.fill();
      ctx.stroke();
      // bande
      ctx.fillStyle = "#cbd5e1";
      ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w - 6, 6);
    } else {
      // silhouette
      // tête
      ctx.beginPath();
      ctx.arc(0, -r * 0.25, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      // buste
      ctx.beginPath();
      ctx.arc(0, r * 0.6, r * 0.9, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /* ------------ groupage de liens (multi-arcs) ------------- */
  const groupedLinks = useMemo(() => {
    const groups = new Map(); // key: "src->dst" ; val: array of links
    for (const l of links) {
      const k = `${l.source}->${l.target}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(l);
    }
    return groups;
  }, [links]);

  /* ------------ rendu canvas ------------- */
  useEffect(() => {
    const cvs = canvasRef.current;
    const wrap = wrapRef.current;
    if (!cvs || !wrap) return;

    const { width, height } = wrap.getBoundingClientRect();
    if (cvs.width !== width) cvs.width = width;
    if (cvs.height !== height) cvs.height = height;

    const ctx = cvs.getContext("2d");
    ctx.clearRect(0, 0, cvs.width, cvs.height);

    // fond blanc (comme la démo)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cvs.width, cvs.height);

    const toX = (x) => x * zoom + offset.x;
    const toY = (y) => y * zoom + offset.y;

    // liens groupés
    groupedLinks.forEach((arr) => {
      // dessiner chaque lien du groupe avec un décalage sur la normale
      const l0 = arr[0];
      const a = layout.pos.get(l0.source);
      const b = layout.pos.get(l0.target);
      if (!a || !b) return;

      const x1 = toX(a.x),
        y1 = toY(a.y);
      const x2 = toX(b.x),
        y2 = toY(b.y);

      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      const dx = x2 - x1,
        dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * 60; // normale (taille base)
      const ny = (dx / len) * 60;

      const sep = 0.35; // espacement relatif
      const k = arr.length;
      arr.forEach((l, i) => {
        const t = (i - (k - 1) / 2) * sep; // offset relatif
        const cx1 = mx + nx * t;
        const cy1 = my + ny * t;

        ctx.lineWidth = Math.max(1, 1.5 * zoom);
        ctx.strokeStyle = EDGE_CLR(l.channel);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(cx1, cy1, x2, y2);
        ctx.stroke();

        // flèche
        const ang = Math.atan2(y2 - cy1, x2 - cx1);
        const ah = 8;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - ah * Math.cos(ang - 0.4), y2 - ah * Math.sin(ang - 0.4));
        ctx.lineTo(x2 - ah * Math.cos(ang + 0.4), y2 - ah * Math.sin(ang + 0.4));
        ctx.closePath();
        ctx.fillStyle = EDGE_CLR(l.channel);
        ctx.fill();

        // label (petit tag du montant)
        const tag = l.amount ? `$${Math.round(l.amount).toLocaleString()}` : (l.channel || `${l.count}x`);
        const lx = cx1, ly = cy1;
        ctx.font = `${Math.max(10, 11 * zoom)}px ui-sans-serif,system-ui`;
        const w = ctx.measureText(tag).width + 8;
        const h = 16;
        ctx.fillStyle = "rgba(17,24,39,0.75)";
        ctx.fillRect(lx - w / 2, ly - h - 2, w, h);
        ctx.fillStyle = "#fff";
        ctx.fillText(tag, lx - w / 2 + 4, ly - 6);
      });
    });

    // nœuds
    nodes.forEach((n) => {
      const p = layout.pos.get(n.id);
      if (!p) return;
      const x = toX(p.x),
        y = toY(p.y);
      const r = p.r * zoom;

      // halo focus
      if (focusId === n.id) {
        ctx.beginPath();
        ctx.arc(x, y, r + 9, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(59,130,246,0.55)";
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      // disque
      ctx.beginPath();
      ctx.fillStyle = NODE_FILL(n);
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      // bord
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // pictogramme
      drawGlyph(ctx, n.type, x, y, r * 0.75);

      // label sous le nœud
      const label =
        n.id.startsWith("tx:") || n.type === "ACCOUNT"
          ? (n.label?.slice(0, 12) || n.id.slice(0, 12)) + "…"
          : (n.label || n.id);
      ctx.fillStyle = "#111827";
      ctx.font = `${Math.max(11, 12 * zoom)}px ui-sans-serif,system-ui`;
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, x - tw / 2, y + r + 14);
    });

    // tooltip
    if (hover) {
      const pad = 6;
      const tx = hover.x + 10,
        ty = hover.y - 10;
      ctx.font = "12px ui-sans-serif,system-ui";
      const w = ctx.measureText(hover.text).width + pad * 2;
      const h = 22;
      ctx.fillStyle = "rgba(17,24,39,0.96)";
      ctx.fillRect(tx, ty - h, w, h);
      ctx.fillStyle = "#fff";
      ctx.fillText(hover.text, tx + pad, ty - 6);
    }
  }, [nodes, groupedLinks, layout, zoom, offset, centerId, focusId, hover]);

  /* ------------ pan (drag) ------------- */
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    let dragging = false;
    let sx = 0,
      sy = 0;
    let start = { ...offset };

    const mdown = (e) => {
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      start = { ...offset };
      cvs.style.cursor = "grabbing";
    };
    const mmove = (e) => {
      if (!dragging) return;
      setOffset({
        x: start.x + (e.clientX - sx),
        y: start.y + (e.clientY - sy),
      });
    };
    const mup = () => {
      dragging = false;
      cvs.style.cursor = "grab";
    };

    cvs.addEventListener("mousedown", mdown);
    window.addEventListener("mousemove", mmove);
    window.addEventListener("mouseup", mup);
    return () => {
      cvs.removeEventListener("mousedown", mdown);
      window.removeEventListener("mousemove", mmove);
      window.removeEventListener("mouseup", mup);
    };
  }, [offset]);

  /* ------------ hit-test (hover/click) ------------- */
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;

    const toX = (x) => x * zoom + offset.x;
    const toY = (y) => y * zoom + offset.y;
    let lastHit = null;

    function onMove(e) {
      const rect = cvs.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // nodes
      for (const n of nodes) {
        const p = layout.pos.get(n.id);
        if (!p) continue;
        const x = toX(p.x),
          y = toY(p.y);
        const r = p.r * zoom + 4;
        if ((mx - x) ** 2 + (my - y) ** 2 <= r ** 2) {
          lastHit = { type: "node", id: n.id, x: mx, y: my, text: n.label || n.id };
          setHover({ x: mx, y: my, text: n.label || n.id });
          return;
        }
      }

      // edges (milieu)
      for (const [key, arr] of groupedLinks.entries()) {
        const l0 = arr[0];
        const a = layout.pos.get(l0.source);
        const b = layout.pos.get(l0.target);
        if (!a || !b) continue;

        const x1 = toX(a.x),
          y1 = toY(a.y);
        const x2 = toX(b.x),
          y2 = toY(b.y);
        const mx2 = (x1 + x2) / 2,
          my2 = (y1 + y2) / 2;
        const dist = Math.hypot(mx - mx2, my - my2);
        if (dist < 14) {
          // assemble un résumé (par channel)
          const byCh = arr.reduce((acc, l) => {
            const k = l.channel || "OTHER";
            acc[k] = (acc[k] || 0) + (l.amount || 0);
            return acc;
          }, {});
          const parts = Object.entries(byCh)
            .map(([c, s]) => `${c}:${Math.round(s)}`)
            .join("  ");
          lastHit = { type: "edge", id: key, x: mx, y: my, text: parts || "edge" };
          setHover({ x: mx, y: my, text: parts || "edge" });
          return;
        }
      }

      lastHit = null;
      setHover(null);
    }

    function onLeave() {
      setHover(null);
    }

    function onClick() {
      if (lastHit?.type === "node") setFocusId(lastHit.id);
    }

    cvs.addEventListener("mousemove", onMove);
    cvs.addEventListener("mouseleave", onLeave);
    cvs.addEventListener("click", onClick);
    return () => {
      cvs.removeEventListener("mousemove", onMove);
      cvs.removeEventListener("mouseleave", onLeave);
      cvs.removeEventListener("click", onClick);
    };
  }, [nodes, groupedLinks, layout, zoom, offset]);

  /* ------------ controls ------------- */
  function zoomIn() {
    setZoom((z) => Math.min(2.6, z * 1.2));
  }
  function zoomOut() {
    setZoom((z) => Math.max(0.22, z / 1.2));
  }
  function reset() {
    fitView();
  }
  function exportPNG() {
    const link = document.createElement("a");
    link.download = "graph.png";
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  }

  /* ------------ UI ------------- */
  return (
    <div className="glass-edge" style={{ padding: 12 }}>
      {/* Filtres locaux */}
      <div className="mb-2" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <label className="flex items-center gap-2">
          <span>Montant min</span>
          <input
            type="number"
            value={minAmount}
            onChange={(e) => setMinAmount(Number(e.target.value || 0))}
            className="w-28 bg-white/70 text-black border border-gray-200 rounded px-2 py-1"
          />
        </label>
        <label className="flex items-center gap-2">
          <span>Profondeur</span>
          <select
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="bg-white/70 text-black border border-gray-200 rounded px-2 py-1"
          >
            <option value={1}>1-hop</option>
            <option value={2}>2-hop</option>
          </select>
        </label>

        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "Chargement…" : "Rafraîchir"}
        </button>

        {/* toolbar droite */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button className="btn" onClick={zoomIn}>+</button>
          <button className="btn" onClick={zoomOut}>−</button>
          <button className="btn" onClick={reset}>⟳</button>
          <button className="btn" onClick={exportPNG}>⭳ PNG</button>
        </div>
      </div>

      {err && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 6 }}>{err}</div>}

      {/* Légende mini */}
      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <span>Couleurs canaux : <b style={{ color:"#7c3aed" }}>CARD</b>, <b style={{ color:"#f97316" }}>WIRE</b>, <b style={{ color:"#22d3ee" }}>CRYPTO</b>, <b style={{ color:"#6b7280" }}>CASH</b>, <b style={{ color:"#22c55e" }}>ACH</b></span>
        <span>Formes : cercle <b style={{color:"#14b8a6"}}>personne</b>, cercle bleu avec carte <b style={{color:"#60a5fa"}}>compte</b>, centre <b style={{color:"#ef4444"}}>rouge</b></span>
      </div>

      <div
        ref={wrapRef}
        style={{
          height: 540,
          borderRadius: 10,
          overflow: "hidden",
          border: "1px solid rgba(148,163,184,0.25)",
          background: "#fff",
          position: "relative",
        }}
      >
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", cursor: "grab" }} />
      </div>
    </div>
  );
}
