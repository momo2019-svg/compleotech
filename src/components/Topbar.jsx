// src/components/Topbar.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiSearch, FiBell, FiLogIn, FiLogOut, FiSettings,
  FiDatabase, FiMoon, FiSun, FiAlertCircle, FiAperture
} from "react-icons/fi";
import { supabase } from "@/lib/supabase.js";
import { useProfile, IfRole } from "@/lib/profile.jsx";

/* Pastille statut (aligne les classes avec le CSS: .chip .open .review .closed) */
const Pill = ({ status }) => {
  const base = { fontSize: 11, padding: "2px 8px", borderRadius: 999, fontWeight: 600, marginLeft: 6 };
  if (status === "OPEN") return <span className="chip open" style={base}>OPEN</span>;
  if (status === "UNDER_REVIEW") return <span className="chip review" style={base}>UNDER_REVIEW</span>;
  return <span className="chip closed" style={base}>CLOSED</span>;
};

export default function Topbar() {
  const nav = useNavigate();
  const { user, role } = useProfile();

  /* THEME (dark | light | ultra-glass — même clé que le Dashboard) */
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("theme") || "dark";
    // applique au DOM
    applyTheme(saved);
    return saved;
  });

  function applyTheme(t) {
    const html = document.documentElement;
    if (t === "light") {
      html.setAttribute("data-theme", "light");
    } else if (t === "ultra-glass") {
      html.setAttribute("data-theme", "ultra-glass");
    } else {
      // dark par défaut: on retire l’attribut
      html.removeAttribute("data-theme");
    }
  }

  function setAndPersistTheme(t) {
    setTheme(t);
    localStorage.setItem("theme", t);
    applyTheme(t);
  }

  /* AUTH */
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [authErr, setAuthErr] = useState("");

  /* UI dropdowns */
  const [showNotif, setShowNotif] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  /* ALERTS */
  const [alerts, setAlerts] = useState([]);
  const [openCount, setOpenCount] = useState(0);

  /* SEARCH */
  const [scope, setScope] = useState("tx_event_id");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const loadAlerts = async () => {
      const { data: al } = await supabase
        .from("alerts")
        .select(`id, message, status, score, created_at, customer:customers(name), txn:transactions(amount,currency,channel)`)
        .order("created_at", { ascending: false })
        .limit(5);
      setAlerts(al || []);

      const { count } = await supabase
        .from("alerts")
        .select("id", { count: "exact", head: true })
        .in("status", ["OPEN", "UNDER_REVIEW"]);
      setOpenCount(count ?? 0);
    };
    loadAlerts();

    const ch = supabase
      .channel("topbar-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, loadAlerts)
      .subscribe();

    return () => supabase.removeChannel(ch);
  }, []);

  /* Auth actions */
  async function signIn() {
    setAuthErr("");
    if (!email || !pwd) return setAuthErr("Email et mot de passe requis.");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
    if (error) setAuthErr(error.message); else setShowUser(false);
  }
  async function signUp() {
    setAuthErr("");
    if (!email || !pwd) return setAuthErr("Email et mot de passe requis.");
    const { error } = await supabase.auth.signUp({ email, password: pwd });
    if (error) setAuthErr(error.message); else setShowUser(false);
  }
  async function signOut() { await supabase.auth.signOut(); setShowUser(false); }

  const initial = (user?.email?.[0] || "D").toUpperCase();

  /* petite navigation rapide via la barre de recherche */
  function submitSearch(e) {
    e?.preventDefault?.();
    if (!query.trim()) return;
    if (scope === "tx_event_id") {
      // ouvre Transactions avec filtre (query param simple pour le moment)
      nav(`/transactions?search=${encodeURIComponent(query.trim())}`);
    } else if (scope === "customers_name") {
      nav(`/clients?search=${encodeURIComponent(query.trim())}`);
    } else {
      nav(`/alerts?search=${encodeURIComponent(query.trim())}`);
    }
    setQuery("");
  }

  return (
    <div className="topbar">
      {/* GAUCHE */}
      <div className="tb-left">
        <select className="select select--pill" value={scope} onChange={(e)=>setScope(e.target.value)}>
          <option value="tx_event_id">Transactions — Event ID</option>
          <option value="customers_name">Clients — Nom</option>
          <option value="alerts_msg">Alertes — Message</option>
        </select>

        <form className="search search--pill" onSubmit={submitSearch}>
          <FiSearch />
          <input
            value={query}
            onChange={(e)=>setQuery(e.target.value)}
            placeholder={
              scope === "tx_event_id"
                ? "Rechercher une transaction par ID externe…"
                : scope === "customers_name"
                ? "Rechercher un client par nom…"
                : "Rechercher une alerte par message…"
            }
          />
        </form>
      </div>

      {/* DROITE */}
      <div className="tb-right">
        {/* visible seulement pour admin */}
        <IfRole roles={["admin"]} fallback={null}>
          <span className="pg-chip"><FiDatabase /> PG</span>
        </IfRole>

        <button className="icon-btn" title="Outils de recherche" onClick={submitSearch}>
          <FiSearch />
        </button>

        {/* Réglages / thème */}
        <div className="dropdown-wrap">
          <button
            className="icon-btn"
            title="Paramètres"
            onClick={() => { setShowSettings(v=>!v); setShowNotif(false); setShowUser(false); }}
          >
            <FiSettings />
          </button>
          {showSettings && (
            <div className="dropdown" style={{ width: 280 }}>
              <div className="dd-header">App Settings</div>
              <button
                className="dd-item-btn"
                onClick={() => setAndPersistTheme(theme === "light" ? "dark" : "light")}
              >
                {theme === "light" ? <FiMoon /> : <FiSun />} &nbsp;Mode {theme === "light" ? "sombre" : "clair"}
              </button>
              <button
                className={"dd-item-btn" + (theme === "ultra-glass" ? " active" : "")}
                onClick={() => setAndPersistTheme(theme === "ultra-glass" ? "dark" : "ultra-glass")}
                title="Activer le thème Ultra Verre (match Dashboard)"
              >
                <FiAperture /> &nbsp;{theme === "ultra-glass" ? "Ultra Verre (ON)" : "Activer Ultra Verre"}
              </button>
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="dropdown-wrap">
          <button
            className="icon-btn"
            title="Notifications"
            onClick={() => { setShowNotif(v=>!v); setShowSettings(false); setShowUser(false); }}
            style={{ position:"relative" }}
          >
            <FiBell />
            {openCount > 0 && (
              <span className="badge" style={{ position:"absolute", top:-6, right:-6 }}>
                {openCount}
              </span>
            )}
          </button>

          {showNotif && (
            <div className="dropdown" style={{ width: 360 }}>
              <div className="dd-header">🔔 Dernières alertes</div>
              {alerts.length === 0 && <div className="dd-empty">Aucune alerte</div>}
              {alerts.map(a => (
                <div
                  key={a.id}
                  className="dd-item"
                  onClick={() => { setShowNotif(false); nav(`/alerts/${a.id}`); }}
                  style={{ cursor:"pointer" }}
                >
                  <FiAlertCircle />
                  <div className="dd-col">
                    <div className="dd-title">
                      {a.message || "Alerte"} <Pill status={a.status} />
                    </div>
                    <div className="dd-sub">
                      {a.customer?.name || "-"} · {a.txn ? `${a.txn.amount} ${a.txn.currency} · ${a.txn.channel}` : "-"}
                    </div>
                  </div>
                </div>
              ))}
              <button className="dd-link" onClick={()=>{ setShowNotif(false); nav("/alerts"); }}>
                Ouvrir la page Alertes
              </button>
            </div>
          )}
        </div>

        {/* Compte */}
        <div className="dropdown-wrap">
          <button
            className="avatar-btn"
            title="Compte"
            onClick={() => { setShowUser(v=>!v); setShowNotif(false); setShowSettings(false); }}
          >
            <span className="avatar">{initial}</span>
            <span className="avatar-info">
              <span className="role">{user ? (role || "analyst").toUpperCase() : "Invité"}</span>
              <span className="company">Compleotech</span>
            </span>
          </button>

          {showUser && (
            <div className="dropdown" style={{ width: 300 }}>
              {user ? (
                <>
                  <div className="dd-header" style={{ fontWeight:600 }}>{user.email}</div>
                  <button className="dd-item-btn" onClick={()=>{ setShowUser(false); nav("/clients"); }}>Mes clients</button>
                  <IfRole roles={["admin"]} fallback={null}>
                    <button className="dd-item-btn" onClick={()=>{ setShowUser(false); nav("/reports"); }}>
                      Admin — Reports
                    </button>
                  </IfRole>
                  <button className="dd-item-btn" onClick={signOut}><FiLogOut /> Se déconnecter</button>
                </>
              ) : (
                <>
                  <div className="dd-header">Se connecter / S’inscrire</div>
                  {authErr && <div style={{ color:"#b91c1c", padding:"8px 12px" }}>{authErr}</div>}
                  <div className="dd-item" style={{ gap:8 }}>
                    <div className="dd-col" style={{ width:"100%" }}>
                      <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
                      <input type="password" placeholder="Mot de passe" value={pwd} onChange={e=>setPwd(e.target.value)} style={{ marginTop:6 }} />
                    </div>
                  </div>
                  <div style={{ padding:"8px 12px", display:"flex", gap:8, justifyContent:"flex-end" }}>
                    <button className="btn" onClick={signIn}><FiLogIn /> Connexion</button>
                    <button className="btn btn--brand" onClick={signUp}>Inscription</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
