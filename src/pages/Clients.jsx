// src/pages/Clients.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase.js";

/* ============== Helpers risque & formats ============== */
function riskFromCountry(country, pep) {
  const c = (country || "").toUpperCase().trim();
  const HIGH = ["IR", "RU", "NG", "AF", "SY", "KP"];
  const MED = ["MA", "DZ", "TN", "TR", "CN", "UA", "BR"];
  if (pep) return "HIGH";
  if (HIGH.includes(c)) return "HIGH";
  if (MED.includes(c)) return "MEDIUM";
  return "LOW";
}
const fmtDate = (d) => new Date(d).toLocaleString();
const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());

export default function Clients() {
  /* ============== Liste & état global ============== */
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(""); // <-- keep THIS one

  /* ============== Formulaire d’ajout ============== */
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [risk, setRisk] = useState("AUTO"); // AUTO = calcul via pays/pep
  const [pep, setPep] = useState(false);
 
  /* ============== Édition ============== */
  const [editingId, setEditingId] = useState(null);
  const [eName, setEName] = useState("");
  const [eEmail, setEEmail] = useState("");
  const [eCountry, setECountry] = useState("");
  const [eRisk, setERisk] = useState("AUTO");
  const [ePep, setEPep] = useState(false);

  /* ============== Recherche + pagination ============== */
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  /* ============== Data loading + realtime ============== */
  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email, country, risk_level, pep, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setList(data || []);
    } catch (e) {
      setErr(e?.message || "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Realtime: si la table change, on recharge
    const ch = supabase
      .channel("rt-customers")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        () => load()
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  /* ============== CRUD ============== */
  const add = async () => {
    setErr("");
    if (!name || !email || !country) {
      setErr("Nom, Email et Pays sont obligatoires.");
      return;
    }
    if (!isEmail(email)) {
      setErr("Email invalide.");
      return;
    }
    const toInsert = {
      name: name.trim(),
      email: email.trim(),
      country: country.trim().toUpperCase(),
      risk_level: risk === "AUTO" ? riskFromCountry(country, pep) : risk,
      pep,
    };
    const { error } = await supabase.from("customers").insert(toInsert);
    if (error) {
      setErr(error.message);
      return;
    }
    setName("");
    setEmail("");
    setCountry("");
    setRisk("AUTO");
    setPep(false);
    load();
  };

  const startEdit = (c) => {
    setEditingId(c.id);
    setEName(c.name || "");
    setEEmail(c.email || "");
    setECountry((c.country || "").toUpperCase());
    setERisk(c.risk_level || "AUTO");
    setEPep(!!c.pep);
    setErr("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setErr("");
  };

  const saveEdit = async () => {
    setErr("");
    if (!editingId) return;

    if (!eName || !eEmail || !eCountry) {
      setErr("Nom, Email et Pays sont obligatoires (édition).");
      return;
    }
    if (!isEmail(eEmail)) {
      setErr("Email invalide (édition).");
      return;
    }

    const nextRisk = eRisk === "AUTO" ? riskFromCountry(eCountry, ePep) : eRisk;

    const { error } = await supabase
      .from("customers")
      .update({
        name: eName.trim(),
        email: eEmail.trim(),
        country: eCountry.trim().toUpperCase(),
        risk_level: nextRisk,
        pep: ePep,
      })
      .eq("id", editingId);

    if (error) {
      setErr(error.message);
      return;
    }

    setEditingId(null);
    load();
  };

  const removeClient = async (id) => {
    // eslint-disable-next-line no-alert
    if (!confirm("Supprimer ce client ? (Transactions/alertes liées supprimées)")) return;
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) {
      // eslint-disable-next-line no-alert
      alert("Erreur suppression: " + error.message);
      return;
    }
    load();
  };

  /* ============== Recherche avancée ============== */
  const filteredAll = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;

    const tokens = q.split(/\s+/);
    return list.filter((c) => {
      const base =
        (c.name || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.country || "").toLowerCase().includes(q) ||
        (c.id || "").toLowerCase().includes(q);

      let ok = base;
      for (const t of tokens) {
        if (t.startsWith("risk:")) {
          const v = t.split(":")[1] || "";
          ok = ok && (c.risk_level || "").toLowerCase() === v;
        } else if (t.startsWith("pep:")) {
          const v = (t.split(":")[1] || "").toLowerCase();
          ok = ok && (v === "yes" || v === "true" ? !!c.pep : !c.pep);
        }
      }
      return ok;
    });
  }, [list, search]);

  /* ============== Pagination ============== */
  const totalPages = Math.max(1, Math.ceil(filteredAll.length / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredAll.slice(start, start + PAGE_SIZE);
  }, [filteredAll, page]);

  /* ============== UI helpers ============== */
  const RiskPill = ({ level }) => {
    const lv = (level || "-").toUpperCase();
    const cls = lv === "HIGH" ? "pill danger" : lv === "MEDIUM" ? "pill warn" : "pill ok";
    return (
      <span className={cls} title={`Risque ${lv}`}>
        {lv}
      </span>
    );
  };

  const PepPill = ({ pep }) => (
    <span className={"pill " + (pep ? "review" : "ok")} title={pep ? "PEP" : "Non PEP"}>
      {pep ? "Oui" : "Non"}
    </span>
  );

  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  };

  const exportCSV = () => {
    const header = ["id", "name", "email", "country", "risk_level", "pep", "created_at"].join(",");
    const lines = list.map((c) =>
      [c.id, c.name, c.email, c.country, c.risk_level, c.pep ? "yes" : "no", c.created_at]
        .map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`)
        .join(",")
    );
    const blob = new Blob([header + "\n" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customers.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ============== Rendu ============== */
  return (
    <div>
      {/* Formulaire d'ajout */}
      <div className="card">
        <div className="card hdr">Ajouter un client</div>
        <div
          className="card body"
          style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
        >
          {err && <div style={{ color: "#b91c1c", marginRight: 8 }}>{err}</div>}
          <input placeholder="Nom" value={name} onChange={(e) => setName(e.target.value)} />
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            placeholder="Pays (FR, MA, US…)"
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
          />
          <select value={risk} onChange={(e) => setRisk(e.target.value)} title="AUTO calcule depuis pays + PEP">
            <option value="AUTO">AUTO</option>
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={pep} onChange={(e) => setPep(e.target.checked)} /> PEP
          </label>
          <button className="btn btn--brand" onClick={add}>Ajouter</button>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn" onClick={load}>Rafraîchir</button>
            <button className="btn" onClick={exportCSV}>Exporter CSV</button>
          </div>
        </div>
      </div>

      {/* Liste + recherche */}
      <div className="card">
        <div
          className="card hdr"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
        >
          <span>Clients</span>
          <input
            className="search"
            placeholder='Rechercher… (nom, email, pays, UUID, ex: "risk:high pep:yes")'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 420 }}
          />
        </div>

        <div className="card body" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 14 }}>Chargement…</div>
          ) : paged.length === 0 ? (
            <div style={{ padding: 14, color: "#6b7280" }}>Aucun client</div>
          ) : (
            <>
              <table width="100%" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#0f172a0d", borderBottom: "1px solid #e5e7eb" }}>
                    <th style={th}>Nom</th>
                    <th style={th}>Email</th>
                    <th style={th}>Pays</th>
                    <th style={th}>Risque</th>
                    <th style={th}>PEP</th>
                    <th style={th}>Créé le</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((c) => (
                    <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      {editingId === c.id ? (
                        <>
                          <td style={td}>
                            <input value={eName} onChange={(e) => setEName(e.target.value)} />
                            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>
                              <code>{c.id}</code>
                            </div>
                          </td>
                          <td style={td}><input value={eEmail} onChange={(e) => setEEmail(e.target.value)} /></td>
                          <td style={td}>
                            <input value={eCountry} onChange={(e) => setECountry(e.target.value.toUpperCase())} />
                          </td>
                          <td style={td}>
                            <select value={eRisk} onChange={(e) => setERisk(e.target.value)} title="AUTO recalcule depuis pays + PEP">
                              <option value="AUTO">AUTO</option>
                              <option value="LOW">LOW</option>
                              <option value="MEDIUM">MEDIUM</option>
                              <option value="HIGH">HIGH</option>
                            </select>
                          </td>
                          <td style={td}>
                            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <input type="checkbox" checked={ePep} onChange={(e) => setEPep(e.target.checked)} /> PEP
                            </label>
                          </td>
                          <td style={td}>{fmtDate(c.created_at)}</td>
                          <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                            <button className="btn btn--brand" onClick={saveEdit} style={{ marginRight: 6 }}>Enregistrer</button>
                            <button className="btn" onClick={cancelEdit}>Annuler</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={td}>
                            <div style={{ fontWeight: 600 }}>{c.name}</div>
                            <div style={{ fontSize: 12, color: "#94a3b8", display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                              <code style={{ userSelect: "all" }}>{c.id}</code>
                              <button className="btn" style={{ padding: "2px 6px", fontSize: 12 }} onClick={() => copy(c.id)}>📋 Copier</button>
                              <a className="btn" style={{ padding: "2px 6px", fontSize: 12 }} href={`/graph?center=${encodeURIComponent(c.id)}`}>Centrer</a>
                            </div>
                          </td>
                          <td style={td}>{c.email}</td>
                          <td style={td}>{c.country}</td>
                          <td style={td}><RiskPill level={c.risk_level} /></td>
                          <td style={td}><PepPill pep={c.pep} /></td>
                          <td style={td}>{fmtDate(c.created_at)}</td>
                          <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                            <button className="btn" onClick={() => startEdit(c)} style={{ marginRight: 6 }}>Modifier</button>
                            <button className="btn" onClick={() => removeClient(c.id)}>Supprimer</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px" }}>
                <div style={{ color: "#9ca3af", fontSize: 13 }}>
                  Page {page} / {totalPages} — {filteredAll.length} clients
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Précédent</button>
                  <button className="btn" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Suivant</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============== Styles inline pour th/td ============== */
const th = { textAlign: "left", padding: "10px 12px", fontWeight: 600, fontSize: 13, color: "#374151" };
const td = { padding: "10px 12px", fontSize: 14 };
