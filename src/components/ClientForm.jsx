import { useState } from "react";
import { supabase } from "@/supabaseClient.js";

export default function ClientForm({ onCreated }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (!name.trim() || !email.trim()) {
      setErr("Nom et email sont requis");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .insert([{ name, email }])
      .select()
      .single();
    setLoading(false);

    if (error) { setErr(error.message); return; }
    setName(""); setEmail("");
    onCreated?.(data);
  };

  return (
    <form onSubmit={submit} className="card body" style={{ maxWidth: 560 }}>
      <h3 style={{ marginTop: 0, marginBottom: 10 }}>Ajouter un client</h3>
      {err && <div style={{ color: "#b91c1c", marginBottom: 8 }}>{err}</div>}
      <div style={{ display: "grid", gap: 8 }}>
        <input
          className="input"
          placeholder="Nom"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 8 }}
        />
        <input
          className="input"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 10, border: "1px solid #e5e7eb", borderRadius: 8 }}
        />
        <button className="btn" disabled={loading}>
          {loading ? "Ajout…" : "Ajouter"}
        </button>
      </div>
    </form>
  );
}
