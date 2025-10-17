// src/lib/profile.jsx
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase.js";

/**
 * Shape:
 * {
 *   user: { id, email } | null,
 *   profile: { user_id, full_name, role } | null,
 *   role: "admin" | "analyst" | "viewer" | null,
 *   loading: boolean
 * }
 */
const ProfileCtx = createContext({ user: null, profile: null, role: null, loading: true });

export function ProfileProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(sessionUser) {
    if (!sessionUser) {
      setUser(null);
      setProfile(null);
      setRole(null);
      setLoading(false);
      return;
    }

    // Profil optionnel : si absent on tombe sur "analyst"
    const { data: p, error } = await supabase
      .from("profiles")
      .select("user_id, full_name, role")
      .eq("user_id", sessionUser.id)
      .maybeSingle();

    if (error) console.warn("[profile] load error:", error.message);

    setUser(sessionUser);
    setProfile(p || null);
    setRole((p?.role && String(p.role)) || "analyst");
    setLoading(false);
  }

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    // 1) état initial
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      loadProfile(session?.user || null);
    });

    // 2) écoute des changements d’auth
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      loadProfile(session?.user || null);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  const value = useMemo(() => ({ user, profile, role, loading }), [user, profile, role, loading]);
  return <ProfileCtx.Provider value={value}>{children}</ProfileCtx.Provider>;
}

export function useProfile() {
  return useContext(ProfileCtx);
}

/** Affiche children si le rôle courant est autorisé, sinon fallback */
export function IfRole({ roles, children, fallback = null }) {
  const { role, loading } = useProfile();
  if (loading) return null;
  return roles.includes(role) ? children : fallback;
}

/** Protège une page complète : redirige vers "/" si rôle non autorisé */
export function RequireRole({ roles, children }) {
  const { role, loading } = useProfile();
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    if (!loading && !roles.includes(role)) {
      nav("/", { replace: true, state: { from: loc.pathname } });
    }
  }, [loading, role, roles, nav, loc]);

  if (loading) return null;
  return roles.includes(role) ? children : null;
}