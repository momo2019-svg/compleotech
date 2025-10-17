// src/pages/Exports.jsx
import { useState } from "react";
import { supabase } from "@/lib/supabase.js";

/* =========================
   Utils téléchargement
   ========================= */
function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* =========================
   Pagination côté client
   ========================= */
async function fetchAllRows(table, { pageSize = 1000, select = "*" } = {}) {
  let from = 0;
  let to = pageSize - 1;
  let all = [];

  // Boucle paginée (éviter pour des tables immenses → préférer Edge Function/Storage)
  /* eslint-disable no-constant-condition */
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, to);
    if (error) throw error;
    const rows = data || [];
    all = all.concat(rows);
    if (rows.length < pageSize) break;
    from += pageSize;
    to += pageSize;
  }
  return all;
}

/* =========================
   Format CSV (UTF-8 + BOM)
   ========================= */
function toCsv(rows) {
  if (!rows || rows.length === 0) return "\uFEFFid\r\n";

  // Colonnes = union des clés (préserve l’ordre des 1res lignes)
  const cols = [];
  const seen = new Set();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
    }
  }

  const esc = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "object") v = JSON.stringify(v);
    let s = String(v);
    s = s.replace(/"/g, '""').replace(/\r?\n/g, " ");
    return `"${s}"`;
  };

  const header = cols.map((c) => `"${c}"`).join(",");
  const lines = rows.map((r) => cols.map((c) => esc(r[c])).join(","));
  return "\uFEFF" + [header, ...lines].join("\r\n");
}

/* =========================
   Composant
   ========================= */
export default function Exports() {
  const [busy, setBusy] = useState(null); // clé bouton en cours

  const isBusy = (k) => busy === k;

  async function handleExport({
    table,
    filenamePrefix,
    key,
    select = "*",
    format = "csv", // "csv" | "json"
  }) {
    try {
      setBusy(key);

      const rows = await fetchAllRows(table, { select });

      const ts = new Date().toISOString().slice(0, 10);

      if (format === "json") {
        const blob = new Blob([JSON.stringify(rows, null, 2)], {
          type: "application/json;charset=utf-8",
        });
        download(`${filenamePrefix}_${ts}.json`, blob);
      } else {
        const csv = toCsv(rows);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        download(`${filenamePrefix}_${ts}.csv`, blob);
      }
    } catch (e) {
      alert("Export impossible : " + (e?.message || String(e)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="card hdr">Exports</div>

      <div className="card body" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {/* Customers (ex-"clients") */}
        <button
          className="btn"
          disabled={isBusy("customers-csv")}
          onClick={() =>
            handleExport({
              table: "customers",
              filenamePrefix: "customers",
              key: "customers-csv",
              format: "csv",
            })
          }
        >
          {isBusy("customers-csv") ? "Export…" : "Customers CSV"}
        </button>
        <button
          className="btn"
          disabled={isBusy("customers-json")}
          onClick={() =>
            handleExport({
              table: "customers",
              filenamePrefix: "customers",
              key: "customers-json",
              format: "json",
            })
          }
        >
          {isBusy("customers-json") ? "Export…" : "Customers JSON"}
        </button>

        {/* Transactions */}
        <button
          className="btn"
          disabled={isBusy("tx-csv")}
          onClick={() =>
            handleExport({
              table: "transactions",
              filenamePrefix: "transactions",
              key: "tx-csv",
              format: "csv",
            })
          }
        >
          {isBusy("tx-csv") ? "Export…" : "Transactions CSV"}
        </button>
        <button
          className="btn"
          disabled={isBusy("tx-json")}
          onClick={() =>
            handleExport({
              table: "transactions",
              filenamePrefix: "transactions",
              key: "tx-json",
              format: "json",
            })
          }
        >
          {isBusy("tx-json") ? "Export…" : "Transactions JSON"}
        </button>

        {/* Alerts */}
        <button
          className="btn"
          disabled={isBusy("alerts-csv")}
          onClick={() =>
            handleExport({
              table: "alerts",
              filenamePrefix: "alerts",
              key: "alerts-csv",
              format: "csv",
            })
          }
        >
          {isBusy("alerts-csv") ? "Export…" : "Alerts CSV"}
        </button>
        <button
          className="btn"
          disabled={isBusy("alerts-json")}
          onClick={() =>
            handleExport({
              table: "alerts",
              filenamePrefix: "alerts",
              key: "alerts-json",
              format: "json",
            })
          }
        >
          {isBusy("alerts-json") ? "Export…" : "Alerts JSON"}
        </button>

        {/* Liens alerte↔transaction (si présent) */}
        <button
          className="btn"
          disabled={isBusy("alert-links-csv")}
          onClick={() =>
            handleExport({
              table: "alert_transactions",
              filenamePrefix: "alert_transactions",
              key: "alert-links-csv",
              format: "csv",
            })
          }
        >
          {isBusy("alert-links-csv") ? "Export…" : "Alert–Txn links CSV"}
        </button>

        {/* AI Findings (si présent) */}
        <button
          className="btn"
          disabled={isBusy("ai-findings-csv")}
          onClick={() =>
            handleExport({
              table: "ai_findings",
              filenamePrefix: "ai_findings",
              key: "ai-findings-csv",
              format: "csv",
            })
          }
        >
          {isBusy("ai-findings-csv") ? "Export…" : "AI Findings CSV"}
        </button>

        {/* Vue enrichie (si tu l’as créée) */}
        <button
          className="btn"
          disabled={isBusy("v-alert-feat-csv")}
          onClick={() =>
            handleExport({
              table: "v_alert_features",
              filenamePrefix: "v_alert_features",
              key: "v-alert-feat-csv",
              format: "csv",
            })
          }
        >
          {isBusy("v-alert-feat-csv") ? "Export…" : "v_alert_features CSV"}
        </button>
      </div>

      <div className="card body" style={{ color: "#94a3b8" }}>
        Conseil : ouvre le fichier dans Excel/Sheets (séparateur « , »). Si Excel ne reconnait pas
        l’encodage, choisis <b>UTF-8</b> à l’import. Pour de très gros volumes, préfère un export via
        Edge Function + Storage.
      </div>
    </>
  );
}
