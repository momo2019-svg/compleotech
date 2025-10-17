import AIRiskIndicators from "@/components/AIRiskIndicators.jsx";
import AIChatDock from "@/components/AIChatDock.jsx";

// Cette page peut recevoir un "context" (alerte, client, graphe, etc.)
export default function AIWorkspace() {
  const context = {
    // mets ici ce que tu veux passer au chat (id alerte, stats graphe, etc.)
    example: "demo",
  };

  return (
    <div style={{ padding: 16 }}>
      <h1 className="text-2xl font-semibold mb-2">AI Workspace</h1>
      <p className="opacity-80 mb-6">
        Génère des “Key Risk Indicators”, résumés et pose des questions via le chat.
      </p>

      <div className="max-w-2xl">
        <AIRiskIndicators features={{ /* TODO: passe tes features ici */ }} />
      </div>

      {/* Dock de chat (bouton en bas à droite) */}
      <AIChatDock context={context} />
    </div>
  );
}
