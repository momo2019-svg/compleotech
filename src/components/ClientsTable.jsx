import { useEffect, useState } from "react";
import { supabase } from '@/lib/supabase.js';

export default function ClientsTable() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    setRows(data || []);
  };

  useEffect(() => { fetchRows(); }, []);

  const remove = async (id) => {
    if (!confirm("Supprimer ce client ?")) return;
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  if (loading) return <div className="card body">Chargement…</div>;
  if (err) return <div className="card body" style={{ color: "#b91c1c" }}>{err}</div>;

  return (
    <div className="card body">
      <h3 style={{ marginTop: 0, marginBottom: 10 }}>Clients</h3>
      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Créé le</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.email}</td>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td style={{ textAlign: "right" }}>
                  <button className="btn" onClick={() => remove(r.id)}>Supprimer</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} style={{ color: "#6b7280", padding: 10 }}>Aucun client</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
