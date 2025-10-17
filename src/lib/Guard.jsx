// src/lib/Guard.jsx
import { Navigate } from "react-router-dom";
import { useProfile } from "@/lib/profile.jsx";

export default function Guard({ children }) {
  const { user, loading } = useProfile();
  if (loading) return <div className="card body">Chargement…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  return children;
}
