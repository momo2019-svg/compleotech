// src/pages/ClientsDetails.jsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export default function ClientsDetails() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: c } = await supabase.from("customers")
        .select("id,name,type,subtype,status,risk_score")
        .eq("id", id).maybeSingle();

      const { data: s } = await supabase.rpc("customer_tx_stats", { p_customer: id }); // cf. §4
      setClient(c);
      setStats(s);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div>Chargement…</div>;
  if (!client) return <div>Client introuvable.</div>;

  return (
    <div>
      <h1 className="page-title">{client.name || client.id}</h1>

      <div className="grid md:grid-cols-3 gap-3">
        <Info title="Type" value={client.type} />
        <Info title="Subtype" value={client.subtype} />
        <Info title="Status" value={client.status} />
        <Info title="Risk" value={client.risk_score ?? "—"} />
        <Info title="Tx 30j" value={stats?.tx_last_30d ?? 0} />
        <Info title="Montant 30j" value={`$${(stats?.amt_last_30d ?? 0).toLocaleString()}`} />
      </div>

      <div className="mt-4 flex gap-2">
        <Link className="btn" to={`/graph?center=${id}`}>Voir le graphe centré</Link>
        <Link className="btn" to={`/transactions?customer=${id}`}>Voir transactions</Link>
      </div>
    </div>
  );
}

function Info({ title, value }) {
  return (
    <div className="glass p-3 rounded">
      <div className="text-xs opacity-70">{title}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
