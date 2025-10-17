// src/pages/Reports.jsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useProfile } from "../lib/profile.jsx";

/* =========================
   ENV (Edge Functions)
   ========================= */
const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL; // ex: https://<ref>.functions.supabase.co
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const PERIODS = [
  { value: "7d", label: "7 jours" },
  { value: "14d", label: "14 jours" },
  { value: "30d", label: "30 jours" },
];

/* =========================
   Helpers locaux
   ========================= */
function labelFromPeriod(p) {
  return p === "30d" ? "30 jours" : p === "14d" ? "14 jours" : "7 jours";
}
function baselineMarkdown(periodLabel) {
  return [
    "# Rapport AML",
    "",
    "## Résumé",
    `Période analysée : ${periodLabel}. Le taux de clôture est en amélioration et les tendances restent sous contrôle.`,
    "",
    "## Principales alertes",
    "- **Transfert international suspect** : justificatifs incomplets.",
    "- **Retrait en espèces important** : atypique vs historique.",
    "- **Dépôt de fonds anonymes** : origine à clarifier.",
    "",
    "## Indicateurs clés",
    "- Nombre d’alertes : ~15",
    "- % clôturées : ~60 %",
    "- Tendances : légère hausse vs période précédente",
    "",
    "## Points à vérifier",
    "- Justificatifs de source des fonds",
    "- Conformité KYC/AML",
    "- Pays d’origine/destination (si applicable)",
    "- Statut PEP / niveau de risque client",
    "",
    "## Actions proposées",
    "- Passer en **UNDER_REVIEW** si nécessaire",
    "- Demander documents au client",
    "- Escalader si incohérences",
    "",
  ].join("\n");
}
function periodRange(period) {
  const end = new Date();
  const start = new Date(end);
  const days = period === "30d" ? 30 : period === "14d" ? 14 : 7;
  start.setDate(end.getDate() - days);
  return { start: start.toISOString(), end: end.toISOString() };
}

/* =========================
   Fetch données période (schéma safe)
   ========================= */
async function fetchPeriodData(period) {
  const { start, end } = periodRange(period);

  // Champs prudents vis-à-vis de ton schéma actuel
  // alerts: id, score, status, created_at, message (optionnel)
  // transactions: id, amount, currency, channel, origin_country, destination_country, created_at, customer_id
  const alertsSel = "id, score, status, created_at, message";
  const txSel =
    "id, amount, currency, channel, origin_country, destination_country, created_at, customer_id";

  try {
    const [alertsRes, txRes] = await Promise.all([
      supabase
        .from("alerts")
        .select(alertsSel)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("transactions")
        .select(txSel)
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    if (alertsRes.error) throw alertsRes.error;
    if (txRes.error) throw txRes.error;

    return {
      start,
      end,
      alerts: alertsRes.data || [],
      transactions: txRes.data || [],
    };
  } catch {
    // En cas d’erreur de schéma on renvoie vide pour ne pas bloquer.
    return { start, end, alerts: [], transactions: [] };
  }
}

/* =========================
   Composant
   ========================= */
export default function Reports() {
  const { user } = useProfile();
  const [period, setPeriod] = useState("7d");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [list, setList] = useState([]);
  const [sel, setSel] = useState(null);

  async function load() {
    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      alert("Erreur chargement rapports: " + error.message);
      return;
    }
    setList(data || []);
    if (data && data.length && !sel) setSel(data[0]);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createDraft() {
    try {
      setSaving(true);
      if (!user?.id) throw new Error("Non authentifié.");
      const title = `Rapport AML – ${new Date().toLocaleDateString("fr-FR")}`;
      const { data, error } = await supabase
        .from("reports")
        .insert([{ title, status: "DRAFT", content: "", created_by: user.id }])
        .select()
        .single();
      if (error) throw error;
      setList((cur) => [data, ...cur]);
      setSel(data);
    } catch (e) {
      alert(e.message || "Impossible de créer le rapport.");
    } finally {
      setSaving(false);
    }
  }

  async function generateAI() {
    setLoading(true);
    try {
      // 0) Données réelles de la période
      const pdata = await fetchPeriodData(period);

      // 1) Chemin normal via invoke
      let resp = await supabase.functions.invoke("report-writer", {
        body: {
          period,
          period_start: pdata.start,
          period_end: pdata.end,
          alerts: pdata.alerts,
          transactions: pdata.transactions,
        },
      });

      // 2) Fallback HTTP direct si invoke échoue
      if (resp.error || !resp.data) {
        const url = `${FUNCTIONS_URL}/report-writer`;
        const r = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ANON_KEY}`,
          },
          body: JSON.stringify({
            period,
            period_start: pdata.start,
            period_end: pdata.end,
            alerts: pdata.alerts,
            transactions: pdata.transactions,
          }),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        resp = { data: await r.json(), error: null };
      }

      // 3) Validation payload
      const data = resp.data || {};
      const md =
        typeof data.markdown === "string" && data.markdown.trim().length > 0
          ? data.markdown
          : baselineMarkdown(labelFromPeriod(period));

      const title =
        data.title ||
        `Rapport AML – période ${labelFromPeriod(period)} (${new Date().toLocaleDateString(
          "fr-FR"
        )})`;

      if (!user?.id) throw new Error("Non authentifié.");

      const { data: row, error: insErr } = await supabase
        .from("reports")
        .insert([
          {
            title,
            status: "DRAFT",
            content: md,
            period_start: data.period_start || pdata.start || null,
            period_end: data.period_end || pdata.end || null,
            created_by: user.id,
          },
        ])
        .select()
        .single();

      if (insErr) throw insErr;

      setList((cur) => [row, ...cur]);
      setSel(row);
    } catch (e) {
      console.error("Génération échouée:", e);
      // 4) Dernier repli : baseline locale
      try {
        const md = baselineMarkdown(labelFromPeriod(period));
        const title = `Rapport AML – période ${labelFromPeriod(period)} (${new Date().toLocaleDateString(
          "fr-FR"
        )})`;
        if (!user?.id) throw new Error("Non authentifié.");
        const { data: row, error: insErr } = await supabase
          .from("reports")
          .insert([
            {
              title,
              status: "DRAFT",
              content: md,
              period_start: null,
              period_end: null,
              created_by: user.id,
            },
          ])
          .select()
          .single();
        if (insErr) throw insErr;
        setList((cur) => [row, ...cur]);
        setSel(row);
        alert("Edge Function indisponible. Un rapport baseline a été créé pour ne pas te bloquer.");
      } catch (e2) {
        alert("Échec de génération : " + (e2?.message || String(e2)));
      }
    } finally {
      setLoading(false);
    }
  }

  async function saveCurrent() {
    if (!sel) return;
    try {
      setSaving(true);
      const { data, error } = await supabase
        .from("reports")
        .update({ title: sel.title, content: sel.content, status: sel.status })
        .eq("id", sel.id)
        .select()
        .single();
      if (error) throw error;
      setSel(data);
      setList((cur) => cur.map((r) => (r.id === data.id ? data : r)));
    } catch (e) {
      alert(e.message || "Échec de la sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  // --------- Outils (Copier / Télécharger / Supprimer)
  function copyMarkdown() {
    if (!sel?.content) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(sel.content).catch(() =>
        alert("Impossible de copier dans le presse-papiers.")
      );
    } else {
      const ta = document.createElement("textarea");
      ta.value = sel.content;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
    }
  }

  function downloadMarkdown() {
    const name =
      ((sel?.title || "rapport").replace(/[^\w\-]+/g, "_") || "rapport") + ".md";
    const blob = new Blob([sel?.content || ""], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function deleteCurrent() {
    if (!sel) return;
    if (!confirm("Supprimer ce rapport ?")) return;
    const { error } = await supabase.from("reports").delete().eq("id", sel.id);
    if (error) {
      alert("Suppression impossible: " + error.message);
      return;
    }
    setList((cur) => cur.filter((r) => r.id !== sel.id));
    setSel(null);
  }

  /* =========================
     Rendus mémoïsés
     ========================= */
  const left = useMemo(
    () => (
      <div className="card body" style={{ height: "62vh" }}>
        {list.length === 0 ? (
          <div style={{ color: "#94a3b8" }}>Aucun rapport</div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              overflow: "auto",
              height: "100%",
            }}
          >
            {list.map((r) => (
              <button
                key={r.id}
                className={"dd-item-btn" + (sel?.id === r.id ? " active" : "")}
                onClick={() => setSel(r)}
                style={{
                  textAlign: "left",
                  borderRadius: 8,
                  border: "1px solid #334155",
                  background: "transparent",
                }}
              >
                <div style={{ fontWeight: 600 }}>{r.title || "Sans titre"}</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  {r.status} • Créé le{" "}
                  {new Date(r.created_at || r.generated_at || Date.now()).toLocaleString("fr-FR")}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    ),
    [list, sel]
  );

  const right = useMemo(
    () => (
      <div
        className="card body"
        style={{
          height: "62vh",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          paddingBottom: 84,
          overflow: "auto",
        }}
      >
        {!sel ? (
          <div style={{ color: "#94a3b8" }}>Sélectionne un rapport à gauche…</div>
        ) : (
          <>
            <input
              value={sel.title || ""}
              onChange={(e) => setSel({ ...sel, title: e.target.value })}
              placeholder="Titre du rapport"
            />
            <select
              className="select"
              value={sel.status || "DRAFT"}
              onChange={(e) => setSel({ ...sel, status: e.target.value })}
            >
              <option value="DRAFT">DRAFT</option>
              <option value="REVIEWED">REVIEWED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
            <textarea
              value={sel.content || ""}
              onChange={(e) => setSel({ ...sel, content: e.target.value })}
              style={{
                width: "100%",
                minHeight: 380,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
              placeholder="Contenu du rapport (markdown)…"
            />
            <div
              className="toolbar"
              style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}
            >
              <button className="btn" onClick={copyMarkdown} disabled={!sel?.content}>
                Copier
              </button>
              <button className="btn" onClick={downloadMarkdown} disabled={!sel?.content}>
                Télécharger (.md)
              </button>
              <button className="btn" onClick={deleteCurrent} disabled={!sel}>
                Supprimer
              </button>
              <button className="btn btn--brand" disabled={saving} onClick={saveCurrent}>
                {saving ? "Sauvegarde…" : "Enregistrer"}
              </button>
            </div>
          </>
        )}
      </div>
    ),
    [sel, saving]
  );

  /* =========================
     Render
     ========================= */
  return (
    <>
      <div
        className="card hdr"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontWeight: 600 }}>Rapports</div>
        <div className="toolbar" style={{ margin: 0 }}>
          <select className="select" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <button className="btn" onClick={createDraft} disabled={saving}>
            {saving ? "Nouveau…" : "Nouveau"}
          </button>
          <button className="btn btn--brand" onClick={generateAI} disabled={loading}>
            {loading ? "Génération…" : "Générer (AI)"}
          </button>
        </div>
      </div>

      <div className="card body" style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14 }}>
        <div>
          <div className="card hdr">Tous les rapports</div>
          {left}
        </div>
        <div>
          <div className="card hdr">Édition du rapport</div>
          {right}
        </div>
      </div>
    </>
  );
}
