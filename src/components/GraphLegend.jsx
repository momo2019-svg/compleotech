// src/components/GraphLegend.jsx
export default function GraphLegend() {
  const pills = [
    ["CARD",   "#7c3aed"],
    ["WIRE",   "#f97316"],
    ["CRYPTO", "#22d3ee"],
    ["CASH",   "#6b7280"],
    ["ACH",    "#22c55e"],
  ];
  return (
    <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6 }}>
      Couleurs canaux :{" "}
      {pills.map(([label, color]) => (
        <span key={label} style={{ marginRight: 10 }}>
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              background: color,
              borderRadius: 2,
              verticalAlign: "middle",
              marginRight: 4,
            }}
          />
          <b style={{ color }}>{label}</b>
        </span>
      ))}{" "}
      • Formes : cercle <b style={{ color: "#14b8a6" }}>personne</b>, cercle bleu avec carte <b style={{ color: "#60a5fa" }}>compte</b>, centre <b style={{ color: "#ef4444" }}>rouge</b>
    </div>
  );
}
