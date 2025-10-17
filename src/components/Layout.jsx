// src/components/Layout.jsx
import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { FiCpu } from "react-icons/fi";
import Sidebar from "./Sidebar.jsx";
import Topbar from "./Topbar.jsx";
import ThemeToggle from "@/components/ThemeToggle.jsx";

export default function Layout({ children }) {
  // Applique le thème mémorisé dès le montage (évite le flash)
  useEffect(() => {
    const saved = localStorage.getItem("theme") || "default";
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  const { pathname } = useLocation();
  const onAI = pathname === "/ai";

  return (
    <div className="layout">
      <aside className="sidebar"><Sidebar /></aside>

      {/* Topbar + Toggle à droite */}
      <header
        className="topbar"
        style={{ display: "flex", alignItems: "center", gap: 8 }}
      >
        <Topbar />
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {/* ✅ Bouton rapide IA */}
          <Link
            to="/ai"
            className="btn ai-launch"
            title="Assistant IA"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid rgba(148,163,184,0.35)",
              background: onAI ? "rgba(99,102,241,0.12)" : "rgba(255,255,255,0.6)",
              color: onAI ? "#4f46e5" : "#111827",
              fontSize: 13,
            }}
          >
            <FiCpu style={{ fontSize: 16 }} />
            <span>IA</span>
          </Link>

          <ThemeToggle />
        </div>
      </header>

      <main className="main">{children}</main>

      {/* ✅ Portal pour monter un dock/chatbot IA plus tard */}
      <div id="ai-portal-root" />
    </div>
  );
}
