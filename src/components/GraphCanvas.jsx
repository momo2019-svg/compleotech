// src/components/GraphCanvas.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase.js";

/**
 * Props:
 * - centerId: string (uuid ou texte de ton centre)
 * - initialFilters?: {
 *     depth?: 1|2,
 *     min_amount?: number,
 *     direction?: "ANY"|"SENDING"|"RECEIVING",
 *     entity_types?: string[],      // ["PERSON","BUSINESS"]
 *     entity_subtypes?: string[],   // ex: ["Merchant","Beneficiary", ...]
 *     entity_status?: string[],     // ex: ["active","Active","Approved"]
 *     topN_enabled?: boolean,
 *     topN?: number,
 *   }
 * - onPickCenter?: (id: string) => void
 */
export default function GraphCanvas({ centerId, initialFilters, onPickCenter }) {
  /* -------------------- ÉTATS / FILTRES -------------------- */
  const [minAmount, setMinAmount] = useState(initialFilters?.min_amount ?? 0);
  const [depth, setDepth] = useState(initialFilters?.depth ?? 1);
  const [direction, setDirection] = useState((initialFilters?.direction || "ANY").toUpperCase());

  // On stocke en UPPER pour les types; subtypes/status restent tels quels
  const [entityTypes, setEntityTypes] = useState(
    (initialFilters?.entity_types ?? []).map((s) => String(s).toUpperCase())
  );
  const [entitySubtypes, setEntitySubtypes] = useState(initialFilters?.entity_subtypes ?? []);
  const [entityStatus, setEntityStatus] = useState(initialFilters?.entity_status ?? []);

  // Options d’affichage
  const [hideEvents, setHideEvents] = useState(false);
  const [topNEnabled, setTopNEnabled] = useState(initialFilters?.topN_enabled ?? true);
  const [topN, setTopN] = useState(Math.max(5, Math.min(200, initialFilters?.topN ?? 40)));

  // Données & états
  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [fallbackUsed, setFallbackUsed] = useState(false);

  // Attributs disponibles côté données (détectés après fetch)
  const [hasSubtypeAttr, setHasSubtypeAttr] = useState(true);
  const [hasStatusAttr, setHasStatusAttr] = useState(true);

  // Viewport
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hover, setHover] = useState(null);
  const [focusId, setFocusId] = useState(null);

  /* -------------------- HELPERS -------------------- */
  const norm = (arr) => (arr || []).map((s) => String(s).trim()).filter(Boolean);
  const normUpper = (arr) => (arr || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean);
  const toNullable = (arr, upper = false) => {
    const v = upper ? normUpper(arr) : norm(arr);
    return v.length ? v : null; // IMPORTANT: PostgREST préfère null à []
  };

  /* -------------------- URL <-> ÉTATS (lecture au 1er rendu) -------------------- */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const g = (k, def) => q.get(k) ?? def;

    const dir = String(g("dir", direction)).toUpperCase();
    const dep = Number(g("depth", depth));
    const min = Number(g("min", minAmount));
    const top = Number(g("topN", topN));
    const topOn = g("topOn", topNEnabled ? "1" : "0") === "1";

    setDirection(dir);
    setDepth(isNaN(dep) ? 1 : dep);
    setMinAmount(isNaN(min) ? 0 : min);
    setTopN(isNaN(top) ? 40 : Math.max(5, Math.min(200, top)));
    setTopNEnabled(topOn);

    const et = g("types", "");
    const esub = g("subtypes", "");
    const est = g("status", "");
    if (et) setEntityTypes(et.split(",").map((s) => s.toUpperCase()).filter(Boolean));
    if (esub) setEntitySubtypes(esub.split(",").filter(Boolean));
    if (est) setEntityStatus(est.split(",").filter(Boolean));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // synchro états -> URL (partage + refresh conservent les filtres)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    q.set("dir", direction);
    q.set("depth", String(depth));
    q.set("min", String(minAmount));
    q.set("topN", String(topN));
    q.set("topOn", topNEnabled ? "1" : "0");

    if (entityTypes.length) q.set("types", entityTypes.join(","));
    else q.delete("types");
    if (entitySubtypes.length) q.set("subtypes", entitySubtypes.join(","));
    else q.delete("subtypes");
    if (entityStatus.length) q.set("status", entityStatus.join(","));
    else q.delete("status");

    const url = `${window.location.pathname}?${q.toString()}`;
    window.history.replaceState(null, "", url);
  }, [direction, depth, minAmount, topN, topNEnabled, entityTypes, entitySubtypes, entityStatus]);

  /* -------------------- FETCH (v7 → v3 fallback) -------------------- */
  async function fetchGraph() {
    const p_direction = (direction || "ANY").toUpperCase();

    // si l’utilisateur ne choisit qu’un sous-ensemble PERSON/BUSINESS, on filtre côté client
    const wantPerson = entityTypes.includes("PERSON");
    const wantBusiness = entityTypes.includes("BUSINESS");
    const subsetTypes = entityTypes.length > 0 && !(wantPerson && wantBusiness);

    // côté serveur on envoie null si on veut “tout”
    const p_entity_types = subsetTypes ? null : toNullable(entityTypes, true);
    const p_entity_subtypes = toNullable(entitySubtypes);
    const p_entity_status = toNullable(entityStatus);

    // 1) tentative v7 (7 paramètres)
    let rpcRes = await supabase.rpc("get_graph_ui", {
      center: String(centerId),
      depth: Number(depth),
      min_amount: Number(minAmount || 0),
      p_direction,
      p_entity_types,
      p_entity_subtypes,
      p_entity_status,
    });

    // 2) détection des erreurs typiques ⇒ fallback v3 (3 paramètres)
    const msg = rpcRes.error?.message || "";
    const needFallback =
      rpcRes.error &&
      /could not find the function|best candidate function|Legacy 3-params|get_graph_ui_v3|schema cache|function signature|type uuid|mismatch/i.test(
        msg
      );

    if (needFallback) {
      setFallbackUsed(true);
      rpcRes = await supabase.rpc("get_graph_ui", {
        center: String(centerId),
        depth: Number(depth),
        min_amount: Number(minAmount || 0),
      });
    }

    if (rpcRes.error) throw rpcRes.error;
    return rpcRes.data || { nodes: [], links: [] };
  }

  /* -------------------- LOAD -------------------- */
  async function load() {
    if (!centerId) return;

    setLoading(true);
    setErr("");
    setFallbackUsed(false);

    // recalcul local pour les filtres type
    const wantPerson = entityTypes.includes("PERSON");
    const wantBusiness = entityTypes.includes("BUSINESS");
    const subsetTypes = entityTypes.length > 0 && !(wantPerson && wantBusiness);

    try {
      const data = await fetchGraph();

      // --- normalisation des nœuds/liens (avec shim pour subtype/status) ---
      let nn = (data?.nodes ?? []).map((n) => {
        const type = String(n.type || "PERSON").toUpperCase();

        // essaie plusieurs clés serveur possibles pour "subtype"
        const subtype =
          n.subtype ??
          n.entity_subtype ??
          n.business_subtype ??
          n.business_type ??
          n.category ??
          n.role ??
          null;

        // idem pour "status"
        const status = n.status ?? n.entity_status ?? n.state ?? n.kyc_status ?? null;

        return {
          id: String(n.id),
          label: String(n.label ?? n.name ?? n.id),
          type,
          risk: Number.isFinite(n.risk) ? Number(n.risk) : 0,
          subtype,
          status,
        };
      });

      let ll = (data?.links ?? []).map((l) => ({
        source: String(l.source),
        target: String(l.target),
        amount: Number(l.amount ?? 0),
        count: Number(l.count ?? 1),
        channel: String(l.channel || l.method || "").toUpperCase(),
      }));

      // disponibilité des attributs (après mapping)
      const _hasSubtype = nn.some((n) => String(n.subtype ?? "").trim() !== "");
      const _hasStatus = nn.some((n) => String(n.status ?? "").trim() !== "");
      setHasSubtypeAttr(_hasSubtype);
      setHasStatusAttr(_hasStatus);

      // dédoublonnage de sécurité
      const seenN = new Set();
      nn = nn.filter((n) => (seenN.has(n.id) ? false : (seenN.add(n.id), true)));
      const seenE = new Set();
      ll = ll.filter((e) => {
        const k = `${e.source}|${e.target}|${e.channel}|${e.amount}|${e.count}`;
        return seenE.has(k) ? false : (seenE.add(k), true);
      });

      // --------- Post-traitements côté client (si fallback / si filtres humains) ---------
      if (fallbackUsed) {
        const cid = String(centerId);
        ll = ll.filter((e) => {
          if (e.amount < (minAmount || 0)) return false;
          if (direction === "ANY") return true;
          if (e.source === cid || e.target === cid) {
            return direction === "SENDING" ? e.source === cid : e.target === cid;
          }
          return true; // ne pas briser la connectivité en 2-hop
        });
      }

      // --- Patch : ignorer les filtres si l'attribut n'existe pas ---
      const applySubtype = norm(entitySubtypes);
      const applyStatus = norm(entityStatus);
      const effSubtype = _hasSubtype ? applySubtype : []; // <= patch
      const effStatus = _hasStatus ? applyStatus : []; // <= patch

      const filterByHumanProps = subsetTypes || effSubtype.length || effStatus.length;

      if (filterByHumanProps) {
        const cid = String(centerId);
        const keepHuman = (node) => {
          const t = node.type;
          const isHuman = t === "PERSON" || t === "BUSINESS";
          if (!isHuman) return false;

          if (subsetTypes) {
            if (wantPerson && t !== "PERSON") return false;
            if (wantBusiness && t !== "BUSINESS") return false;
          }
          if (effSubtype.length && t === "BUSINESS") {
            const val = String(node.subtype ?? "").trim().toLowerCase();
            if (val) {
              const ok = effSubtype.some((s) => val === String(s).trim().toLowerCase());
              if (!ok) return false;
            }
          }
          if (effStatus.length) {
            const val = String(node.status ?? "").trim().toLowerCase();
            if (val) {
              const ok = effStatus.some((s) => val === String(s).trim().toLowerCase());
              if (!ok) return false;
            }
          }
          return true;
        };

        const isTech = (n) =>
          n.type === "ACCOUNT" || n.type === "WALLET" || String(n.id).startsWith("tx:");

        // 1) garde le centre + humains conformes
        const keepIds = new Set([cid]);
        nn.forEach((n) => {
          if (keepHuman(n)) keepIds.add(n.id);
        });

        // 2) propage via les nœuds techniques connectés
        let changed = true;
        while (changed) {
          changed = false;
          for (const e of ll) {
            const a = e.source,
              b = e.target;
            const na = nn.find((n) => n.id === a);
            const nb = nn.find((n) => n.id === b);
            if (!na || !nb) continue;
            if (keepIds.has(a) && isTech(nb) && !keepIds.has(b)) {
              keepIds.add(b);
              changed = true;
            }
            if (keepIds.has(b) && isTech(na) && !keepIds.has(a)) {
              keepIds.add(a);
              changed = true;
            }
          }
        }

        nn = nn.filter((n) => keepIds.has(n.id));
        ll = ll.filter((e) => keepIds.has(e.source) && keepIds.has(e.target));
      }

      if (hideEvents) {
        const isEvent = (n) =>
          String(n.id).startsWith("tx:") || n.type === "ACCOUNT" || n.type === "WALLET";
        const keepIds = new Set(nn.filter((n) => !isEvent(n)).map((n) => n.id));
        nn = nn.filter((n) => keepIds.has(n.id));
        ll = ll.filter((e) => keepIds.has(e.source) && keepIds.has(e.target));
      }

      // Top-N (depuis le centre)
      if (topNEnabled && topN > 0) {
        const cid = String(centerId);
        const score = new Map();
        for (const e of ll) {
          const neighbor = e.source === cid ? e.target : e.target === cid ? e.source : null;
          if (!neighbor) continue;
          score.set(neighbor, (score.get(neighbor) || 0) + (e.amount || 0));
        }
        const allowed = new Set(
          [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([id]) => id)
        );
        const keep = new Set([cid, ...allowed]);

        // propage via les branches déjà retenues
        let changed = true;
        while (changed) {
          changed = false;
          for (const e of ll) {
            if (keep.has(e.source) && !keep.has(e.target)) {
              keep.add(e.target);
              changed = true;
            }
            if (keep.has(e.target) && !keep.has(e.source)) {
              keep.add(e.source);
              changed = true;
            }
          }
        }
        nn = nn.filter((n) => keep.has(n.id));
        ll = ll.filter((e) => keep.has(e.source) && keep.has(e.target));
      }

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
  }, [
    centerId,
    depth,
    minAmount,
    direction,
    entityTypes,
    entitySubtypes,
    entityStatus,
    hideEvents,
    topNEnabled,
    topN,
    hasSubtypeAttr,
    hasStatusAttr,
  ]);

  /* -------------------- LAYOUT -------------------- */
  const layout = useMemo(() => {
    if (nodes.length === 0)
      return { pos: new Map(), bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };

    const center = nodes.find((n) => n.id === String(centerId)) ?? nodes[0];
    const others = nodes.filter((n) => n.id !== center.id);
    const pos = new Map();

    const cx = 0,
      cy = 0;
    pos.set(center.id, { x: cx, y: cy, r: center.type === "ACCOUNT" ? 16 : 18 });

    const R = Math.max(160, Math.min(460, 120 + others.length * 18));
    const step = (2 * Math.PI) / Math.max(1, others.length);
    others.forEach((n, i) => {
      const a = i * step;
      pos.set(n.id, {
        x: cx + R * Math.cos(a),
        y: cy + R * Math.sin(a),
        r: n.type === "ACCOUNT" ? 16 : 18,
      });
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

  /* -------------------- RENDU -------------------- */
  const NODE_FILL = (n) => {
    if (n.id === String(centerId)) return "#ef4444";
    switch (n.type) {
      case "ACCOUNT":
      case "WALLET":
        return "#60a5fa";
      case "BUSINESS":
        return "#34d399";
      case "PERSON":
      default:
        return "#14b8a6";
    }
  };

  const EDGE_CLR = (ch) => {
    switch (ch) {
      case "CARD":
        return "rgba(124,58,237,0.7)";
      case "WIRE":
        return "rgba(249,115,22,0.7)";
      case "CRYPTO":
        return "rgba(34,211,238,0.75)";
      case "CASH":
        return "rgba(107,114,128,0.7)";
      case "ACH":
        return "rgba(34,197,94,0.7)";
      default:
        return "rgba(99,102,241,0.6)";
    }
  };

  function drawGlyph(ctx, type, x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,0.1)";
    ctx.lineWidth = 1;

    if (type === "ACCOUNT" || type === "WALLET") {
      const w = r * 1.5,
        h = r * 1.0;
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") ctx.roundRect(-w / 2, -h / 2, w, h, 3);
      else ctx.rect(-w / 2, -h / 2, w, h);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#cbd5e1";
      ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w - 6, 6);
    } else {
      ctx.beginPath();
      ctx.arc(0, -r * 0.25, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, r * 0.6, r * 0.9, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /* ------------ groupage de liens ------------- */
  const groupedLinks = useMemo(() => {
    const groups = new Map();
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

    // fond
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cvs.width, cvs.height);

    const toX = (x) => x * zoom + offset.x;
    const toY = (y) => y * zoom + offset.y;

    // liens groupés
    groupedLinks.forEach((arr) => {
      const l0 = arr[0];
      const a = layout.pos.get(l0.source);
      const b = layout.pos.get(l0.target);
      if (!a || !b) return;

      const x1 = toX(a.x),
        y1 = toY(a.y);
      const x2 = toX(b.x),
        y2 = toY(b.y);

      const mx = (x1 + x2) / 2,
        my = (y1 + y2) / 2;
      const dx = x2 - x1,
        dy = y2 - y1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * 60,
        ny = (dx / len) * 60;

      const sep = 0.35;
      const k = arr.length;
      arr.forEach((l, i) => {
        const t = (i - (k - 1) / 2) * sep;
        const cx1 = mx + nx * t,
          cy1 = my + ny * t;

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
        // label
        const tag = l.amount ? `$${Math.round(l.amount).toLocaleString()}` : l.channel || `${l.count}x`;
        const lx = cx1,
          ly = cy1;
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

      if (focusId === n.id) {
        ctx.beginPath();
        ctx.arc(x, y, r + 9, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(59,130,246,0.55)";
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.fillStyle = NODE_FILL(n);
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1;
      ctx.stroke();

      drawGlyph(ctx, n.type, x, y, r * 0.75);

      const label =
        n.id.startsWith("tx:") || n.type === "ACCOUNT"
          ? (n.label?.slice(0, 12) || n.id.slice(0, 12)) + "…"
          : n.label || n.id;
      ctx.fillStyle = "#111827";
      ctx.font = `${Math.max(11, 12 * zoom)}px ui-sans-serif,system-ui`;
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, x - tw / 2, y + r + 14);
    });

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

  /* -------------------- PAN/ZOOM -------------------- */
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
      setOffset({ x: start.x + (e.clientX - sx), y: start.y + (e.clientY - sy) });
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

  /* -------------------- HIT-TEST -------------------- */
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
          const clickable = n.type !== "ACCOUNT" && !String(n.id).startsWith("tx:");
          cvs.style.cursor = clickable ? "pointer" : "grab";
          lastHit = { type: "node", id: n.id, node: n, x: mx, y: my, text: n.label || n.id };
          setHover({ x: mx, y: my, text: n.label || n.id });
          return;
        }
      }

      // edges (milieu approx)
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
          cvs.style.cursor = "grab";
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
      cvs.style.cursor = "grab";
    }

    function onLeave() {
      setHover(null);
      cvs.style.cursor = "grab";
    }

    function onClick() {
      if (lastHit?.type !== "node") return;
      setFocusId(lastHit.id);
      const t = (lastHit.node?.type || "").toUpperCase();
      const isTxn = String(lastHit.id).startsWith("tx:");
      if (onPickCenter && t !== "ACCOUNT" && t !== "WALLET" && !isTxn) {
        onPickCenter(String(lastHit.id));
      }
    }

    cvs.addEventListener("mousemove", onMove);
    cvs.addEventListener("mouseleave", onLeave);
    cvs.addEventListener("click", onClick);
    return () => {
      cvs.removeEventListener("mousemove", onMove);
      cvs.removeEventListener("mouseleave", onLeave);
      cvs.removeEventListener("click", onClick);
    };
  }, [nodes, groupedLinks, layout, zoom, offset, onPickCenter]);

  // auto-fit si resize
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => fitView());
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [layout]);

  /* -------------------- UI HELPERS -------------------- */
  function toggleIn(setter, arr, val) {
    setter(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  }
  function onClear() {
    setMinAmount(0);
    setDepth(1);
    setDirection("ANY");
    setEntityTypes([]);
    setEntitySubtypes([]);
    setEntityStatus([]);
    setHideEvents(false);
    setTopNEnabled(true);
    setTopN(40);
  }
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

  // -------- Export CSV (nœuds + liens) --------
  function toCSV(rows) {
    if (!rows?.length) return "";
    const headers = Object.keys(rows[0]);
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const body = rows.map((r) => headers.map((h) => esc(r[h])).join(",")).join("\n");
    return headers.join(",") + "\n" + body;
  }
  function download(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  function exportCSV() {
    const nodesCSV = nodes.length ? toCSV(nodes) : "id,label,type,risk,subtype,status\n";
    const linksCSV = links.length ? toCSV(links) : "source,target,amount,count,channel\n";
    const merged = `--- NODES ---\n${nodesCSV}\n\n--- LINKS ---\n${linksCSV}\n`;
    download("graph.csv", merged);
  }

  // -------- Raccourcis clavier --------
  useEffect(() => {
    function onKey(e) {
      const tag = (e.target?.tagName || "").toUpperCase();
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "r" || e.key === "R") fitView();
      if (e.key === "+") setZoom((z) => Math.min(2.6, z * 1.2));
      if (e.key === "-") setZoom((z) => Math.max(0.22, z / 1.2));
      if (e.key === "c" || e.key === "C") onClear();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeFilters =
    (entityTypes?.length || 0) +
    (entitySubtypes?.length || 0) +
    (entityStatus?.length || 0) +
    (direction !== "ANY" ? 1 : 0) +
    (minAmount ? 1 : 0) +
    (hideEvents ? 1 : 0) +
    (topNEnabled ? 1 : 0);

  /* -------------------- RENDER UI -------------------- */
  return (
    <div className="glass-edge" style={{ padding: 12 }}>
      {/* keyframes locaux pour le skeleton */}
      <style>{`@keyframes shimmer{from{background-position:0 0;}to{background-position:240px 0;}}`}</style>

      <div className="mb-2" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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

        <label className="flex items-center gap-2">
          <span>Direction</span>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            className="bg-white/70 text-black border border-gray-200 rounded px-2 py-1"
          >
            <option value="ANY">Any</option>
            <option value="SENDING">Sending</option>
            <option value="RECEIVING">Receiving</option>
          </select>
        </label>

        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "Chargement…" : "Rafraîchir"}
        </button>

        <button className="btn" onClick={onClear} title="Réinitialiser les filtres">
          Clear
        </button>

        <div className="text-xs opacity-70">{activeFilters ? `${activeFilters} filtre(s) actifs` : "Aucun filtre"}</div>

        {/* Toolbar droite */}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {/* Limiter Top-N */}
          <label className="flex items-center gap-2" title="Limiter au Top-N des voisins du centre (par montant)">
            <input
              type="checkbox"
              checked={topNEnabled}
              onChange={(e) => setTopNEnabled(e.target.checked)}
            />
            <span>Limiter (Top-N)</span>
            <input
              type="number"
              value={topN}
              min={5}
              max={200}
              onChange={(e) => setTopN(Math.max(5, Math.min(200, Number(e.target.value || 0))))}
              className="w-20 bg-white/70 text-black border border-gray-200 rounded px-2 py-1"
              disabled={!topNEnabled}
            />
          </label>

          <button className="btn" onClick={zoomIn} title="Zoom +">+</button>
          <button className="btn" onClick={zoomOut} title="Zoom −">−</button>
          <button
            className="btn"
            onClick={() => setHideEvents((v) => !v)}
            title="Masquer/afficher comptes & événements"
            style={hideEvents ? { outline: "2px solid #94a3b8" } : undefined}
          >
            ○
          </button>
          <button className="btn" onClick={reset} title="Recentrer">⟳</button>
          <button className="btn" onClick={exportPNG} title="Exporter PNG">⭳ PNG</button>
          <button className="btn" onClick={exportCSV} title="Exporter CSV">⭳ CSV</button>
        </div>
      </div>

      {/* Chips */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, marginBottom: 8, fontSize: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <b>Entity type:</b>
          {["PERSON", "BUSINESS"].map((t) => (
            <button
              key={t}
              className={"chip " + (entityTypes.includes(t) ? "open" : "")}
              onClick={() => toggleIn(setEntityTypes, entityTypes, t)}
              title="Filtre facultatif"
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <b>Subtype:</b>
          {["Merchant", "Beneficiary", "Auto Repair Shop"].map((t) => (
            <button
              key={t}
              className={"chip " + (entitySubtypes.includes(t) ? "review" : "")}
              onClick={() => toggleIn(setEntitySubtypes, entitySubtypes, t)}
              title="Filtre facultatif"
            >
              {t}
            </button>
          ))}
          {entitySubtypes.length > 0 && !hasSubtypeAttr && (
            <span style={{ color: "#b45309", marginLeft: 8 }}>
              (filtre subtype ignoré : attribut non présent dans les données)
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <b>Status:</b>
          {["active", "Active", "Approved"].map((t) => (
            <button
              key={t}
              className={"chip " + (entityStatus.includes(t) ? "ok" : "")}
              onClick={() => toggleIn(setEntityStatus, entityStatus, t)}
              title="Filtre facultatif"
            >
              {t}
            </button>
          ))}
          {entityStatus.length > 0 && !hasStatusAttr && (
            <span style={{ color: "#b45309", marginLeft: 8 }}>
              (filtre status ignoré : attribut non présent dans les données)
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      {fallbackUsed ? (
        <div style={{ color: "#b45309", fontSize: 13, marginBottom: 6, lineHeight: 1.4 }}>
          <b>Mode fallback (3 paramètres) détecté :</b>
          <br />
          — <b>Direction</b> et <b>Montant min</b> appliqués côté client ✅
          <br />
          — Les filtres <b>Type/Subtype/Status</b> sont appliqués côté client (si présents).
          <br />
          Mets à jour la fonction SQL <code>get_graph_ui</code> en v7 côté serveur pour activer tous les filtres et de meilleures perfs.
        </div>
      ) : null}

      {err && <div style={{ color: "#ef4444", fontSize: 13, marginBottom: 6 }}>{err}</div>}

      {/* Légende mini */}
      <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <span>
          Couleurs canaux : <b style={{ color: "#7c3aed" }}>CARD</b>, <b style={{ color: "#f97316" }}>WIRE</b>,{" "}
          <b style={{ color: "#22d3ee" }}>CRYPTO</b>, <b style={{ color: "#6b7280" }}>CASH</b>,{" "}
          <b style={{ color: "#22c55e" }}>ACH</b>
        </span>
        <span>
          Formes : cercle <b style={{ color: "#14b8a6" }}>personne</b>, carte bleue <b style={{ color: "#60a5fa" }}>compte</b>, centre{" "}
          <b style={{ color: "#ef4444" }}>rouge</b>
        </span>
      </div>

      <div
        ref={wrapRef}
        style={{
          height: 560,
          borderRadius: 10,
          overflow: "hidden",
          border: "1px solid rgba(148,163,184,0.25)",
          background: "#fff",
          position: "relative",
        }}
      >
        {loading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "repeating-linear-gradient(90deg, #f8fafc 0px, #f1f5f9 120px, #f8fafc 240px)",
              animation: "shimmer 1.2s linear infinite",
              opacity: 0.6,
              pointerEvents: "none",
            }}
          />
        )}
        <canvas ref={canvasRef} style={{ width: "100%", height: "100%", cursor: "grab" }} />
      </div>
    </div>
  );
}
