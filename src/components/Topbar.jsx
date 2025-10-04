// src/components/Topbar.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FiSearch, FiBell, FiLogIn, FiLogOut, FiSettings,
  FiDatabase, FiMoon, FiSun, FiAlertCircle
} from "react-icons/fi";
import { supabase } from "../lib/supabase.js";

const Pill = ({ status }) => {
  const base = { fontSize: 11, padding: "2px 8px", borderRadius: 999, fontWeight: 600, marginLeft: 6 };
  if (status === "OPEN") return <span className="pill open" style={base}>OPEN</span>;
  if (status === "UNDER_REVIEW") return <span className="pill under_review" style={base}>UNDER_REVIEW</span>;
  return <span className="pill closed" style={base}>CLOSED</span>;
};

export default function Topbar() {
  const nav = useNavigate();

  /* THEME */
  const [theme, setTheme] = useState(() => (localStorage.getItem("theme") === "light" ? "light" : "dark"));
  useEffect(() => {
    if (theme === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    localStorage.setItem("theme", theme);
  }, [theme]);

  /* AUTH */
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [authErr, setAuthErr] = useState("");

  /* UI */
  const [showNotif, setShowNotif] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  /* ALERTS */
  const [alerts, setAlerts] = useState([]);
  const [openCount, setOpenCount] = useState(0);

  /* SCOPE + SEARCH */
  const [scope, setScope] = useState("tx_event_id");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data?.user ?? null);
    })();

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

    const authSub = supabase.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
    const ch = supabase
      .channel("topbar-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "alerts" }, loadAlerts)
      .subscribe();

    return () => {
      authSub.data.subscription.unsubscribe();
      supabase.removeChannel(ch);
    };
  }, []);

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

  return (
    <div className="topbar">
      {/* GAUCHE = scope + search (search prend la place) */}
      <div className="tb-left">
        <select className="select select--pill" value={scope} onChange={(e)=>setScope(e.target.value)}>
          <option value="tx_event_id">Transactions — Event ID</option>
          <option value="customers_name">Customers — Name</option>
          <option value="alerts_msg">Alerts — Message</option>
        </select>

        <div className="search search--pill">
          <FiSearch />
          <input
            placeholder={
              scope === "tx_event_id"
                ? "Search for transactions by external id (requires exact match)…"
                : scope === "customers_name"
                ? "Search customers by name…"
                : "Search alerts by message…"
            }
          />
        </div>
      </div>

      {/* DROITE = actions + compte */}
      <div className="tb-right">
        <span className="pg-chip"><FiDatabase /> PG</span>

        <button className="icon-btn" title="Search tools">
          <FiSearch />
        </button>

        <div className="dropdown-wrap">
          <button
            className="icon-btn"
            title="Paramètres"
            onClick={() => { setShowSettings(v=>!v); setShowNotif(false); setShowUser(false); }}
          >
            <FiSettings />
          </button>
          {showSettings && (
            <div className="dropdown" style={{ width: 260 }}>
              <div className="dd-header">Settings</div>
              <button className="dd-item-btn" onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
                {theme === "light" ? <FiMoon /> : <FiSun />} &nbsp;Passer en mode {theme === "light" ? "sombre" : "clair"}
              </button>
            </div>
          )}
        </div>

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
                <div key={a.id} className="dd-item">
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

        <div className="dropdown-wrap">
          <button
            className="avatar-btn"
            title="Compte"
            onClick={() => { setShowUser(v=>!v); setShowNotif(false); setShowSettings(false); }}
          >
            <span className="avatar">{initial}</span>
            <span className="avatar-info">
              <span className="role">{user ? "Product Manager" : "Invité"}</span>
              <span className="company">Acme Inc.</span>
            </span>
          </button>

          {showUser && (
            <div className="dropdown" style={{ width: 300 }}>
              {user ? (
                <>
                  <div className="dd-header" style={{ fontWeight:600 }}>{user.email}</div>
                  <button className="dd-item-btn" onClick={()=>{ setShowUser(false); nav("/clients"); }}>Mes clients</button>
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
