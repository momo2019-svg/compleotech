// src/pages/Imports.jsx
import { useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { supabase } from "@/lib/supabase.js";

/* =============================
   Spécification des imports
   (alignée sur notre schéma actuel)
   ============================= */
const TABLES = {
  customers: {
    label: "customers",
    required: ["name", "email", "country"],
    optional: ["risk_level", "pep", "created_at"],
    pk: "email", // upsert par email
    tips: [
      "Encodage UTF-8, séparateur virgule (,), en-têtes sur la 1re ligne.",
      "pep: true/false (ou 1/0, yes/no – auto-normalisé).",
      "risk_level: LOW, MEDIUM, HIGH",
      "country: Codes ISO-2 (FR, MA, US, …).",
    ],
  },
  transactions: {
    label: "transactions",
    required: ["customer_id", "amount", "currency", "channel"],
    optional: ["origin_country", "destination_country", "created_at", "id"],
    pk: "id", // si id fourni → upsert, sinon insert
    tips: [
      "amount: nombre (ex: 1200.50).",
      "currency: ISO 4217 (USD, EUR, …) — origin/destination: ISO-2.",
      "created_at: ISO 8601 (ex: 2025-10-06T10:30:00Z).",
      "Si vous laissez 'id' vide, ce sera un INSERT (pk auto).",
    ],
  },
  alerts: {
    label: "alerts",
    required: ["customer_id", "score", "status", "created_at"],
    optional: ["transaction_id", "message", "id"],
    pk: "id", // si id fourni → upsert, sinon insert
    tips: [
      "score: 0–100",
      "status ∈ OPEN, UNDER_REVIEW, CLOSED",
      "created_at: ISO 8601",
    ],
  },
};

/* =============================
   Modèles CSV (téléchargement)
   ============================= */
const MODEL_CSV = {
  customers:
    "name,email,country,risk_level,pep,created_at\n" +
    "John Doe,john@example.com,FR,LOW,false,2025-10-06T10:30:00Z\n",
  transactions:
    "id,customer_id,amount,currency,channel,origin_country,destination_country,created_at\n" +
    ",8e1a9c12-1111-2222-3333-abcdefabcdef,1250.50,USD,CARD,FR,ES,2025-10-06T10:30:00Z\n",
  alerts:
    "id,customer_id,transaction_id,score,status,message,created_at\n" +
    ",8e1a9c12-1111-2222-3333-abcdefabcdef,,72,OPEN,amount_high,2025-10-06T10:31:00Z\n",
};

/* =============================
   UI utilitaires
   ============================= */
function Section({ title, right, children }) {
  return (
    <div className="card body" style={{ padding: 0 }}>
      <div
        className="card hdr"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
      >
        <div>{title}</div>
        {right}
      </div>
      <div className="card body" style={{ paddingTop: 12 }}>{children}</div>
    </div>
  );
}

/* =============================
   Page Imports
   ============================= */
export default function Imports() {
  const [tableKey, setTableKey] = useState("customers");
  const [fileName, setFileName] = useState("aucun");
  const [rawCSV, setRawCSV] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({}); // {targetCol: sourceCol}
  const [analyzing, setAnalyzing] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [upsert, setUpsert] = useState(true);
  const fileRef = useRef(null);

  const spec = TABLES[tableKey];

  const mappedPreview = useMemo(() => {
    if (!rows.length || !spec) return [];
    const targets = [...spec.required, ...spec.optional];
    return rows.slice(0, 20).map((r) => {
      const obj = {};
      for (const t of targets) {
        const s = mapping[t];
        obj[t] = s ? r[s] : "";
      }
      return obj;
    });
  }, [rows, mapping, spec]);

  function downloadTemplate() {
    const name = `${spec.label}-template.csv`;
    const blob = new Blob([MODEL_CSV[tableKey]], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  function resetAll() {
    setFileName("aucun");
    if (fileRef.current) fileRef.current.value = "";
    setRawCSV("");
    setHeaders([]);
    setRows([]);
    setMapping({});
  }

  function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setRawCSV(""); // priorité au fichier
  }

  async function analyze() {
    try {
      setAnalyzing(true);

      let text = rawCSV.trim();
      if (!text && fileRef.current?.files?.[0]) {
        text = await fileRef.current.files[0].text();
      }
      if (!text) {
        alert("Choisis un fichier ou colle un contenu CSV.");
        return;
      }

      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        transformHeader: (h) => h.trim(),
      });

      if (parsed.errors?.length) {
        console.warn(parsed.errors);
        const first = parsed.errors[0];
        alert(`Erreur parsing CSV (ligne ${first?.row ?? "?"}): ${first?.message || "inconnue"}`);
        return;
      }

      const hdrs = parsed.meta.fields || [];
      const data = (parsed.data || []).map((r) => normalizeRow(r));
      setHeaders(hdrs);
      setRows(data);

      // Mapping auto : associer par nom exact si possible
      const nextMap = {};
      for (const t of [...spec.required, ...spec.optional]) {
        const direct = hdrs.find((h) => h.toLowerCase() === t.toLowerCase());
        if (direct) nextMap[t] = direct;
      }
      setMapping(nextMap);
    } finally {
      setAnalyzing(false);
    }
  }

  function normalizeRow(r) {
    // petites normalisations utiles
    const obj = { ...r };
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === "string") obj[k] = obj[k].trim();
    }

    // booleans usuels
    if (Object.prototype.hasOwnProperty.call(obj, "pep")) {
      const v = String(obj.pep ?? "").toLowerCase();
      obj.pep =
        ["true", "1", "yes", "y", "oui"].includes(v)
          ? true
          : ["false", "0", "no", "n", "non"].includes(v)
          ? false
          : obj.pep;
    }

    // normalisations génériques
    if (obj.country) obj.country = String(obj.country).toUpperCase().slice(0, 2);
    if (obj.origin_country) obj.origin_country = String(obj.origin_country).toUpperCase().slice(0, 2);
    if (obj.destination_country) obj.destination_country = String(obj.destination_country).toUpperCase().slice(0, 2);
    if (obj.currency) obj.currency = String(obj.currency).toUpperCase();
    if (obj.channel) obj.channel = String(obj.channel).toUpperCase();

    // numériques
    if (Object.prototype.hasOwnProperty.call(obj, "amount")) {
      const n = Number(String(obj.amount).replace(",", "."));
      if (!Number.isNaN(n)) obj.amount = n;
    }
    if (Object.prototype.hasOwnProperty.call(obj, "score")) {
      const s = Number(obj.score);
      if (!Number.isNaN(s)) obj.score = s;
    }

    // dates
    for (const key of ["created_at", "occurred_at"]) {
      if (obj[key]) {
        const d = Date.parse(obj[key]);
        if (!Number.isNaN(d)) obj[key] = new Date(d).toISOString();
      }
    }

    return obj;
  }

  async function runImport() {
    if (!rows.length) {
      alert("Analyse d’abord un CSV.");
      return;
    }
    // Vérification mapping colonnes requises
    const missing = spec.required.filter((t) => !mapping[t]);
    if (missing.length) {
      alert("Colonnes non mappées : " + missing.join(", "));
      return;
    }

    // Construire le payload minimal, en ne gardant que les colonnes cibles
    const targets = [...spec.required, ...spec.optional];
    const finalRows = rows.map((r) => {
      const obj = {};
      for (const t of targets) {
        const src = mapping[t];
        if (src) obj[t] = r[src];
      }
      return obj;
    });

    const { data, error } = await supabase.functions.invoke("bulk-import", {
      body: {
        table: tableKey,          // "customers" | "transactions" | "alerts"
        pk: spec.pk,              // email/id
        upsert,                   // true → UPDATE si pk existe
        dryRun,                   // true → simulation
        columns: targets,
        rows: finalRows,
      },
    });

    if (error) {
      alert("Erreur Edge Function: " + error.message);
      return;
    }
    if (!data?.ok) {
      alert("Import rejeté: " + (data?.error || "inconnu"));
      return;
    }

    const msg = dryRun
      ? `Simulation OK.\nPrévu: ${data.stats.total} lignes\nIgnorées: ${data.stats.ignored}\nErreurs: ${data.stats.errors}`
      : `Import terminé.\nInsérées/Mises à jour: ${data.stats.upserted}\nIgnorées: ${data.stats.ignored}\nErreurs: ${data.stats.errors}`;

    alert(msg);

    // si réel import, reset
    if (!dryRun) resetAll();
  }

  return (
    <>
      <div
        className="card hdr"
        style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}
      >
        <div style={{ fontWeight: 600 }}>Imports</div>
        <div className="toolbar glass-edge glow-teal" style={{ margin: 0, gap: 8 }}>
          <select
            className="select"
            value={tableKey}
            onChange={(e) => {
              setTableKey(e.target.value);
              resetAll();
            }}
          >
            {Object.keys(TABLES).map((k) => (
              <option key={k} value={k}>
                {TABLES[k].label}
              </option>
            ))}
          </select>

          <input
            type="file"
            ref={fileRef}
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Choisir un fichier
          </button>

          <button className="btn" onClick={analyze} disabled={analyzing}>
            {analyzing ? "Analyse…" : "Analyser CSV"}
          </button>

          <button className="btn btn--brand" onClick={runImport} disabled={!rows.length}>
            {dryRun ? "Simuler import" : "Importer"}
          </button>
        </div>
      </div>

      <div className="card body" style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 14 }}>
        {/* Conseils */}
        <Section
          title="Conseils & format attendu"
          right={
            <div className="toolbar" style={{ margin: 0 }}>
              <button className="btn" onClick={downloadTemplate}>
                Télécharg­er modèle CSV
              </button>
              <button className="btn" onClick={resetAll}>
                Réinitialiser
              </button>
            </div>
          }
        >
          <div style={{ color: "#94a3b8", marginBottom: 10 }}>
            Fichier: <span style={{ color: "#fff" }}>{fileName}</span> • Encodage recommandé: <b>UTF-8</b> • Séparateur: <b>,</b> (virgule)
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
              Colonnes cibles pour <i>{spec.label}</i> :
            </div>
            <ul style={{ marginLeft: 18 }}>
              {spec.required.map((c) => (
                <li key={c}>
                  <b>{c}</b> (requis)
                </li>
              ))}
              {spec.optional.map((c) => (
                <li key={c}>{c} (optionnel)</li>
              ))}
            </ul>
          </div>
          <div style={{ marginBottom: 10 }}>
            {spec.tips.map((t, i) => (
              <div key={i} style={{ opacity: 0.9 }}>
                • {t}
              </div>
            ))}
          </div>

          <textarea
            placeholder="(Optionnel) colle ici le contenu CSV si tu ne veux pas choisir de fichier…"
            value={rawCSV}
            onChange={(e) => {
              setRawCSV(e.target.value);
              setFileName("aucun");
            }}
            style={{
              width: "100%",
              minHeight: 120,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }}
          />
          <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 10 }}>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
              Simulation (dry-run)
            </label>
            <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={upsert} onChange={(e) => setUpsert(e.target.checked)} />
              Mettre à jour si existe (clé: {spec.pk})
            </label>
          </div>
        </Section>

        {/* Aperçu + Mapping */}
        <Section
          title="Aperçu"
          right={
            <div style={{ color: "#94a3b8" }}>
              {rows.length ? `${rows.length} lignes détectées` : "Aucun aperçu pour le moment."}
            </div>
          }
        >
          {!rows.length ? (
            <div style={{ color: "#94a3b8" }}>
              Aperçu vide. Choisis un fichier ou colle du CSV puis clique “Analyser CSV”.
            </div>
          ) : (
            <>
              <div className="card hdr" style={{ marginBottom: 10 }}>
                Mapping des colonnes
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 10 }}>
                {[...spec.required, ...spec.optional].map((t) => (
                  <div key={t} style={{ display: "contents" }}>
                    <div style={{ fontWeight: spec.required.includes(t) ? 600 : 400 }}>
                      {t} {spec.required.includes(t) && <span style={{ color: "#ef4444" }}>*</span>}
                    </div>
                    <select
                      className="select"
                      value={mapping[t] || ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [t]: e.target.value }))}
                    >
                      <option value="">{spec.required.includes(t) ? "— choisir colonne source —" : "(ignorer)"}</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="card hdr" style={{ marginTop: 16 }}>
                Aperçu (20 premières lignes après mapping)
              </div>
              <div
                style={{
                  overflow: "auto",
                  maxHeight: 320,
                  border: "1px solid #334155",
                  borderRadius: 8,
                }}
              >
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {[...spec.required, ...spec.optional].map((c) => (
                        <th
                          key={c}
                          style={{
                            textAlign: "left",
                            padding: 8,
                            borderBottom: "1px solid #334155",
                            position: "sticky",
                            top: 0,
                            background: "rgba(15,23,42,.7)",
                          }}
                        >
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mappedPreview.map((r, i) => (
                      <tr key={i}>
                        {[...spec.required, ...spec.optional].map((c) => (
                          <td
                            key={c}
                            style={{
                              padding: "6px 8px",
                              borderBottom: "1px dashed #1f2937",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {String(r[c] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>
      </div>
    </>
  );
}
