// src/components/ClientForm.jsx
import { useState } from "react";
import { supabase } from "@/lib/supabase.js";

const RISK = ["LOW", "MEDIUM", "HIGH"];

export default function ClientForm({ onCreated }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [risk, setRisk] = useState("LOW");
  const [pep, setPep] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setMsg("");

    if (!name.trim() || !email.trim() || !country.trim()) {
      setErr("Nom, email et pays sont requis.");
      return;
    }
    if (country.trim().length !== 2) {
      setErr("Pays : code ISO-2 (ex: FR, US, MA).");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .insert([{
        name: name.trim(),
        email: email.trim(),
        country: country.trim().toUpperCase(),
        risk_level: risk,
        pep: !!pep,
      }])
      .select()
      .single();
    setLoading(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setMsg("✅ Client ajouté !");
    setName("");
    setEmail("");
    setCountry("");
    setRisk("LOW");
    setPep(false);
    onCreated?.(data);
  }

  return (
    <form onSubmit={submit} className="card body" style={{ maxWidth: 720 }}>
      <div className="card hdr" style={{ marginTop: -8 }}>Ajouter un client</div>

      {err && <div style={{ color: "#b91c1c", marginBottom: 8 }}>{err}</div>}
      {msg && <div style={{ color: "#10b981", marginBottom: 8 }}>{msg}</div>}

      <div style={{ display: "grid", gap: 10 }}>
        <input
          placeholder="Nom complet"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            placeholder="Pays (FR, US, MA…)"
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            maxLength={2}
            style={{ width: 160 }}
          />
          <select value={risk} onChange={(e) => setRisk(e.target.value)}>
            {RISK.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={pep} onChange={(e) => setPep(e.target.checked)} />
            PEP
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn--brand" disabled={loading}>
            {loading ? "Ajout…" : "Ajouter"}
          </button>
        </div>
      </div>
    </form>
  );
}
