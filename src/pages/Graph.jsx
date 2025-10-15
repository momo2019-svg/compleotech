// src/pages/Graph.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase.js";
import GraphCanvas from "@/components/GraphCanvas.jsx";
import GraphLegend from "@/components/GraphLegend.jsx";

export default function GraphPage() {
  const [centerId, setCenterId]   = useState("");
  const [minAmount, setMinAmount] = useState(0);
  const [depth, setDepth]         = useState(1);

  const [loading, setLoading]     = useState(false);
  const [hint, setHint]           = useState("");
  const [centers, setCenters]     = useState([]); // {id, name, tx}

  // Cherche des centres côté front (clients qui ont des transactions)
  async function findCenters() {
    setLoading(true);
    setHint("Recherche des clients ayant des transactions…");
    try {
      // 1) regrouper par customer_id dans transactions
      const { data: byTx, error: eTx } = await supabase
        .from("transactions")
        .select("customer_id, count:id")
        .not("customer_id", "is", null)
        .group("customer_id")
        .order("count", { ascending: false });

      if (eTx) {
        setHint("Erreur lecture transactions (RLS ?): " + eTx.message);
        setCenters([]);
        return;
      }
      if (!byTx || byTx.length === 0) {
        setHint("Aucune transaction liée à un client. (Pas de centre possible)");
        setCenters([]);
        return;
      }

      // 2) récupérer les noms des clients pour affichage
      const ids = byTx.map((r) => r.customer_id);
      const { data: custs } = await supabase
        .from("customers")
        .select("id,name")
        .in("id", ids);

      const nameMap = new Map((custs || []).map((c) => [c.id, c.name || c.id]));
      const rows = byTx.map((r) => ({
        id: r.customer_id,
        name: nameMap.get(r.customer_id) || r.customer_id,
        tx: r.count || 0,
      }));

      setCenters(rows);
      if (rows.length > 0) {
        setCenterId(String(rows[0].id)); // sélection auto du plus actif
        setHint(`Centre choisi automatiquement: ${rows[0].name} (${rows[0].tx} tx)`);
      } else {
        setHint("Aucun centre trouvé.");
      }
    } finally {
      setLoading(false);
    }
  }

  // Bouton “Trouver un centre via les transactions”
  async function useActiveCenter() {
    await findCenters();
  }

  // Au premier affichage: essaie une fois
  useEffect(() => {
    findCenters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Controls = useMemo(
    () => (
      <div className="mb-3 flex items-center gap-3 text-sm" style={{ flexWrap: "wrap" }}>
        <label className="flex items-center gap-2">
          <span>Centre (UUID)</span>
          <input
            value={centerId}
            onChange={(e) => setCenterId(e.target.value)}
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

        <button
          className="btn"
          onClick={useActiveCenter}
          disabled={loading}
          title="Trouver automatiquement un client ayant des transactions"
        >
          Trouver un centre via les transactions
        </button>

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

        {hint && <span className="text-xs opacity-70">{hint}</span>}
      </div>
    ),
    [centerId, minAmount, depth, centers, hint, loading]
  );

  return (
    <div>
      <h1 className="page-title">Explorateur de graphe</h1>
      {Controls}
      <GraphLegend />

      {!centerId ? (
        <div style={{ opacity: 0.7 }}>
          Aucun centre sélectionné. Clique <b>“Trouver un centre via les transactions”</b>
          {" "}ou choisis dans la liste quand elle apparaît.
        </div>
      ) : (
        <GraphCanvas
          centerId={centerId}
          initialFilters={{ depth, min_amount: minAmount }}
        />
      )}
    </div>
  );
}
