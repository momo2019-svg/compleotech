// src/pages/Clients.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase.js";

export default function Clients() {
  // Liste
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);

  // Ajout
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [risk, setRisk] = useState("LOW");
  const [pep, setPep] = useState(false);
  const [err, setErr] = useState("");

  // Edition
  const [editingId, setEditingId] = useState(null);
  const [eName, setEName] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [eCountry, setECountry] = useState("");
  const [eRisk, setERisk] = useState("LOW");
  const [ePep, setEPep] = useState(false);

  // Recherche
  const [search, setSearch] = useState("");

  // ------- helpers
  const fmtDate = (d) => new Date(d).toLocaleString();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, email, country, risk_level, pep, created_at")
      .order("created_at", { ascending: false });
    if (!error) setList(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Realtime: si la table change, on recharge
    const ch = supabase
      .channel("rt-customers")
      .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const add = async () => {
    setErr("");
    if (!name || !email || !country) {
      setErr("Nom, Email et Pays sont obligatoires.");
      return;
    }
    const { error } = await supabase.from("customers").insert({
      name: name.trim(),
      email: email.trim(),
      country: country.trim().toUpperCase(),
      risk_level: risk,
      pep,
    });
    if (error) setErr(error.message);
    else {
      setName(""); setEmail(""); setCountry(""); setRisk("LOW"); setPep(false);
      load();
    }
  };

  const startEdit = (c) => {
    setEditingId(c.id);
    setEName(c.name || "");
    setEEmail(c.email || "");
    setECountry((c.country || "").toUpperCase());
    setERisk(c.risk_level || "LOW");
    setEPep(!!c.pep);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    if (!editingId) return;
    const { error } = await supabase
      .from("customers")
      .update({
        name: eName.trim(),
        email: eEmail.trim(),
        country: eCountry.trim().toUpperCase(),
        risk_level: eRisk,
        pep: ePep,
      })
      .eq("id", editingId);

    if (!error) {
      setEditingId(null);
      load();
    } else {
      alert("Erreur mise à jour: " + error.message);
    }
  };

  const removeClient = async (id) => {
    if (!confirm("Supprimer ce client ? (Transactions/alertes liées supprimées)")) return;
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (!error) load();
    else alert("Erreur suppression: " + error.message);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.country || "").toLowerCase().includes(q)
    );
  }, [list, search]);

  return (
    <div>
      {/* Formulaire d'ajout */}
      <div className="card">
        <div className="card hdr">Ajouter un client</div>
        <div className="card body" style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
          {err && <div style={{color:"#b91c1c", marginRight:8}}>{err}</div>}
          <input placeholder="Nom" value={name} onChange={e=>setName(e.target.value)} />
          <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
          <input placeholder="Pays (FR, MA, US…)" value={country} onChange={e=>setCountry(e.target.value.toUpperCase())} />
          <select value={risk} onChange={e=>setRisk(e.target.value)}>
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
          </select>
          <label style={{display:"flex", alignItems:"center", gap:6}}>
            <input type="checkbox" checked={pep} onChange={e=>setPep(e.target.checked)} /> PEP
          </label>
          <button className="btn btn--brand" onClick={add}>Ajouter</button>
        </div>
      </div>

      {/* Liste + recherche */}
      <div className="card">
        <div className="card hdr" style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span>Clients</span>
          <input
            className="search"
            placeholder="Rechercher nom/email/pays…"
            value={search}
            onChange={e=>setSearch(e.target.value)}
            style={{ maxWidth: 320 }}
          />
        </div>

        <div className="card body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding:14 }}>Chargement…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:14, color:"#6b7280" }}>Aucun client</div>
          ) : (
            <table width="100%" style={{ borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"#f9fafb", borderBottom:"1px solid #e5e7eb" }}>
                  <th style={th}>Nom</th>
                  <th style={th}>Email</th>
                  <th style={th}>Pays</th>
                  <th style={th}>Risk</th>
                  <th style={th}>PEP</th>
                  <th style={th}>Créé le</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} style={{ borderBottom:"1px solid #f1f5f9" }}>
                    {editingId === c.id ? (
                      <>
                        <td style={td}><input value={eName} onChange={e=>setEName(e.target.value)} /></td>
                        <td style={td}><input value={eEmail} onChange={e=>setEEmail(e.target.value)} /></td>
                        <td style={td}><input value={eCountry} onChange={e=>setECountry(e.target.value.toUpperCase())} /></td>
                        <td style={td}>
                          <select value={eRisk} onChange={e=>setERisk(e.target.value)}>
                            <option value="LOW">LOW</option>
                            <option value="MEDIUM">MEDIUM</option>
                            <option value="HIGH">HIGH</option>
                          </select>
                        </td>
                        <td style={td}>
                          <label style={{display:"flex", alignItems:"center", gap:6}}>
                            <input type="checkbox" checked={ePep} onChange={e=>setEPep(e.target.checked)} /> PEP
                          </label>
                        </td>
                        <td style={td}>{fmtDate(c.created_at)}</td>
                        <td style={{ ...td, textAlign:"right", whiteSpace:"nowrap" }}>
                          <button className="btn btn--brand" onClick={saveEdit} style={{ marginRight:6 }}>Enregistrer</button>
                          <button className="btn" onClick={cancelEdit}>Annuler</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td style={td}>{c.name}</td>
                        <td style={td}>{c.email}</td>
                        <td style={td}>{c.country}</td>
                        <td style={td}>
                          <span className="chip" title={c.risk_level}>{c.risk_level || "-"}</span>
                        </td>
                        <td style={td}>
                          <span className="chip" title={c.pep ? "Politically Exposed Person" : "Non PEP"}>
                            {c.pep ? "Oui" : "Non"}
                          </span>
                        </td>
                        <td style={td}>{fmtDate(c.created_at)}</td>
                        <td style={{ ...td, textAlign:"right", whiteSpace:"nowrap" }}>
                          <button className="btn" onClick={() => startEdit(c)} style={{ marginRight:6 }}>Modifier</button>
                          <button className="btn" onClick={() => removeClient(c.id)}>Supprimer</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const th = { textAlign:"left", padding:"10px 12px", fontWeight:600, fontSize:13, color:"#374151" };
const td = { padding:"10px 12px", fontSize:14 };
