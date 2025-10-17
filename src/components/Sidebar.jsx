// src/components/Sidebar.jsx
import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase.js";
import {
  FiHome,
  FiUsers,
  FiRepeat,
  FiBell,
  FiBarChart2,
  FiFileText,
  FiUpload,
  FiDownload,
  FiAlertTriangle,
  FiCpu, // 🧠 Icône AI
} from "react-icons/fi";
import { GiNetworkBars } from "react-icons/gi"; // ✅ icône pour le graphe

function LinkItem({ to, label, badge, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => "navlink" + (isActive ? " active" : "")}
    >
      {Icon ? <Icon className="nav-icon" /> : null}
      <span>{label}</span>
      {badge > 0 && <span className="badge">{badge}</span>}
    </NavLink>
  );
}

export default function Sidebar() {
  const [openCount, setOpenCount] = useState(0);

  async function loadBadge() {
    const { count, error } = await supabase
      .from("alerts")
      .select("id", { head: true, count: "exact" })
      .in("status", ["OPEN", "UNDER_REVIEW"]);
    if (!error) setOpenCount(count ?? 0);
  }

  useEffect(() => {
    loadBadge();
    const ch = supabase
      .channel("alerts-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        loadBadge
      )
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  return (
    <nav className="sidebar glass-edge ultra-nav" aria-label="Navigation principale">
      <div
        className="brand"
        style={{ display: "flex", alignItems: "center", marginBottom: 20 }}
      >
        <img src="/image.png" alt="Logo Compleotech" style={{ width: 40, marginRight: 10 }} />
        <span>Compleotech</span>
      </div>

      <LinkItem to="/"             label="Accueil"       icon={FiHome} end />
      <LinkItem to="/clients"      label="Clients"       icon={FiUsers} />
      <LinkItem to="/transactions" label="Transactions"  icon={FiRepeat} />
      <LinkItem to="/alerts"       label="Alertes"       icon={FiBell} badge={openCount} />
      <LinkItem to="/dashboard"    label="Dashboard"     icon={FiBarChart2} />

      {/* --- Section IA --- */}
      <div className="sidebar-divider" />
      <div className="section-title">AI</div>
      <LinkItem to="/ai"          label="AI Workspace"  icon={FiCpu} />

      <div className="sidebar-divider" />
      <div className="section-title">Reporting</div>

      <LinkItem to="/reports"    label="Rapports"       icon={FiFileText} />
      <LinkItem to="/imports"    label="Imports"        icon={FiUpload} />
      <LinkItem to="/exports"    label="Exports"        icon={FiDownload} />
      <LinkItem to="/anomalies"  label="Anomalies"      icon={FiAlertTriangle} />
      <LinkItem to="/hubs"       label="Hubs (graphe)"  icon={FiBarChart2} />

      {/* ✅ AJOUT : lien direct vers la page Graph Explorer */}
      <LinkItem to="/graph"      label="Graph Explorer" icon={GiNetworkBars} />
    </nav>
  );
}
