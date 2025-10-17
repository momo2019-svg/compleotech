// src/pages/AIWorkspace.jsx
import AIRiskIndicators from "../components/AIRiskIndicators.jsx";
import AIChatDock from "../components/AIChatDock.jsx";
export default function AIWorkspace() {
  // Contexte futur (alerte, client, graphe, etc.)
  const features = {};

  return (
    <div style={{ padding: 16 }}>
      <h1 className="text-2xl font-bold">AI Workspace</h1>
      <p className="opacity-70 mt-2">
        Génère des “Key Risk Indicators”, des résumés et pose des questions via le chat.
      </p>

      <div className="mt-6">
        <AIRiskIndicators features={features} />
      </div>

      {/* Dock de chat IA (flottant) */}
      <AIChatDock context={features} />
    </div>
  );
}
