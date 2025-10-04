// src/components/Sidebar.jsx
import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

function LinkItem({ to, label, badge }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => "navlink" + (isActive ? " active" : "")}
    >
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
    loadBadge(); // 1er chargement

    // Realtime: toute modif sur alerts => on recharge le badge
    const ch = supabase
      .channel("alerts-badge")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        loadBadge
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <div>
      <div className="brand" style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
        <img src="/image.png" alt="Logo" style={{ width: 40, marginRight: 10 }} />
        <span>Compleotech</span>
      </div>

      <LinkItem to="/" label="Accueil" />
      <LinkItem to="/clients" label="Clients" />
      <LinkItem to="/transactions" label="Transactions" />
      <LinkItem to="/alerts" label="Alertes" badge={openCount} />
      <LinkItem to="/dashboard" label="Dashboard" />
      <LinkItem to="/reports" label="Rapports" />
    </div>
  );
}
