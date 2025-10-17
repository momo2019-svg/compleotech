// src/pages/Graph.jsx
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase.js";
import GraphCanvas from "@/components/GraphCanvas.jsx";
import GraphLegend from "@/components/GraphLegend.jsx";

export default function GraphPage() {
  // URL <-> état
  const [searchParams, setSearchParams] = useSearchParams();

  // Entrées utilisateur
  const [centerId, setCenterId] = useState("");
  const [minAmount, setMinAmount] = useState(0);
  const [depth, setDepth] = useState(1);

  // 🔵 Nouveau : masque des événements (transactions) — par défaut FAUX (donc on les affiche)
  const [hideEvents, setHideEvents] = useState(false);

  // Découverte automatique
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState("");
  const [centers, setCenters] = useState([]); // [{id, name, tx}]

  /** Cherche des centres probables dans les transactions récentes (émetteur et destinataire) */
  async function findCenters() {
    setLoading(true);
    setHint("Recherche d’un client actif (émetteur ou destinataire)…");
    try {
      const { data, error } = await supabase
        .from("transactions")
        .select("customer_id, receiver_id, created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      if (error) throw error;
      if (!data || data.length === 0) {
        setHint("Aucune transaction.");
        setCenters([]);
        setCenterId("");
        return;
      }

      // Fréquences sur BOTH colonnes
      const freq = new Map();
      for (const t of data) {
        if (t.customer_id) {
          const k = String(t.customer_id);
          freq.set(k, (freq.get(k) || 0) + 1);
        }
        if (t.receiver_id) {
          const k = String(t.receiver_id);
          freq.set(k, (freq.get(k) || 0) + 1);
        }
      }

      if (freq.size === 0) {
        setHint("Aucun identifiant trouvé dans les transactions.");
        setCenters([]);
        setCenterId("");
        return;
      }

      // Top IDs triés par fréquence
      const sorted = [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25);
      const ids = sorted.map(([id]) => id);

      // Récupérer les noms en un seul appel
      const { data: custs, error: e2 } = await supabase
        .from("customers")
        .select("id,name")
        .in("id", ids);

      if (e2) throw e2;

      const nameById = new Map((custs || []).map((c) => [String(c.id), c.name || null]));
      const options = sorted.map(([id, tx]) => ({
        id,
        name: nameById.get(String(id)) || id.slice(0, 8) + "…",
        tx,
      }));

      setCenters(options);

      const best = options[0];
      const bestId = String(best.id);
      setCenterId(bestId);
      setHint(`Centre trouvé : ${best.name} (${best.tx} tx)`);

      // pousse dans l’URL
      const next = new URLSearchParams(searchParams);
      next.set("center", bestId);
      setSearchParams(next, { replace: true });
    } catch (e) {
      console.error(e);
      setHint("Erreur inattendue : " + (e?.message || e));
      setCenters([]);
      setCenterId("");
    } finally {
      setLoading(false);
    }
  }

  // Auto-init : si ?center= est présent, on l’utilise, sinon on tente findCenters()
  useEffect(() => {
    const fromUrl = (searchParams.get("center") || "").trim();
    if (fromUrl) {
      setCenterId(fromUrl);
      setHint("");
      return;
    }
    // pas de center dans l’URL -> auto-découverte
    findCenters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quand centerId change, synchronise l’URL
  useEffect(() => {
    if (!centerId) return;
    const next = new URLSearchParams(searchParams);
    next.set("center", centerId);
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerId]);

  // Entrée : valider avec Enter dans le champ UUID
  function onCenterInputKey(e) {
    if (e.key === "Enter") {
      const v = String(e.currentTarget.value || "").trim();
      if (v) setCenterId(v);
    }
  }

  // 🔵 Nouveau : compteur de filtres actifs (simple et utile)
  const filtersActiveCount = useMemo(() => {
    let n = 0;
    if (hideEvents) n += 1;
    if (Number(minAmount) > 0) n += 1;
    // (si tu ajoutes d’autres filtres plus tard, incrémente ici)
    return n;
  }, [hideEvents, minAmount]);

  // 🔵 Nouveau : bouton Clear qui remet l’état par défaut (et ré-affiche les événements)
  function clearFilters() {
    setMinAmount(0);
    setDepth(1);
    setHideEvents(false);
    // rien d’autre à reset pour le moment
  }

  // Barre de contrôle
  const Controls = useMemo(
    () => (
      <div className="mb-3 flex items-center gap-3 text-sm" style={{ flexWrap: "wrap" }}>
        <label className="flex items-center gap-2">
          <span>Centre (UUID)</span>
          <input
            value={centerId}
            onChange={(e) => setCenterId(e.target.value)}
            onKeyDown={onCenterInputKey}
            placeholder="id client…"
            className="min-w-[360px] bg-white/70 text-black border border-gray-200 rounded px-2 py-1"
          />
        </label>

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

        {/* 🔵 Toggle “○ Événements” */}
        <button
          className={`btn ${hideEvents ? "bg-slate-700 text-white" : ""}`}
          title={hideEvents ? "Afficher les événements" : "Masquer les événements"}
          onClick={() => setHideEvents((v) => !v)}
        >
          ○
        </button>

        <button
          className="btn"
          onClick={findCenters}
          disabled={loading}
          title="Trouver automatiquement un client ayant des transactions"
        >
          Trouver un centre via les transactions
        </button>

        {/* Sélecteur rapide des centres trouvés */}
        {centers.length > 0 && (
          <select
            className="select"
            onChange={(e) => setCenterId(e.target.value)}
            value={centerId}
            title="Centres trouvés (clients avec transactions)"
          >
            {centers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.tx} tx
              </option>
            ))}
          </select>
        )}

        {/* 🔵 Clear + indicateur */}
        <div className="flex items-center gap-2">
          <button className="btn" onClick={clearFilters} title="Réinitialiser les filtres">
            Clear
          </button>
          <span className="text-xs opacity-70">
            {filtersActiveCount} filtre(s) actifs
          </span>
        </div>

        {hint && <span className="text-xs opacity-70">{hint}</span>}
      </div>
    ),
    [centerId, minAmount, depth, centers, hint, loading, hideEvents, filtersActiveCount]
  );

  // Objet de filtres passé au canvas — 🔵 ajout de hide_events
  const canvasFilters = useMemo(
    () => ({
      depth,
      min_amount: minAmount,
      hide_events: hideEvents,
    }),
    [depth, minAmount, hideEvents]
  );

  return (
    <div>
      <h1 className="page-title">Explorateur de graphe</h1>

      {Controls}
      <GraphLegend />

      {/* Légende concise */}
      <div style={{ fontSize: 12, color: "#9ca3af", margin: "6px 0 8px" }}>
        Couleurs canaux : <b style={{ color: "#7c3aed" }}>CARD</b>,{" "}
        <b style={{ color: "#f97316" }}>WIRE</b>, <b style={{ color: "#22d3ee" }}>CRYPTO</b>,{" "}
        <b style={{ color: "#6b7280" }}>CASH</b>, <b style={{ color: "#22c55e" }}>ACH</b> •{" "}
        Formes : cercle <b style={{ color: "#14b8a6" }}>personne</b>, cercle bleu avec carte{" "}
        <b style={{ color: "#60a5fa" }}>compte</b>, centre <b style={{ color: "#ef4444" }}>rouge</b>
      </div>

      {!centerId ? (
        <div style={{ opacity: 0.7 }}>
          Aucun centre sélectionné. Clique <b>“Trouver un centre via les transactions”</b>{" "}
          ou saisis un UUID client.
        </div>
      ) : (
        <GraphCanvas
          centerId={centerId}
          initialFilters={canvasFilters}
          onPickCenter={(id) => setCenterId(id)} // clic dans le graphe -> recentre & sync URL via useEffect
        />
      )}
    </div>
  );
}
