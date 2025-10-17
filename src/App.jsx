// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";

import Home from "./pages/Home.jsx";
import Clients from "./pages/Clients.jsx";
import Transactions from "./pages/Transactions.jsx";
import Alerts from "./pages/Alerts.jsx";
import AlertsDetails from "./pages/AlertsDetails.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Reports from "./pages/Reports.jsx";
import Imports from "./pages/Imports.jsx";
import Exports from "./pages/Exports.jsx";
import Hubs from "./pages/Hubs.jsx";
import Anomalies from "./pages/Anomalies.jsx";
import Auth from "./Auth.jsx";
import Graph from "./pages/Graph.jsx";

// ✅ ajout
import AI from "./pages/AI.jsx";

import { ProfileProvider, RequireRole, useProfile } from "./lib/profile.jsx";

function AppGate({ children }) {
  const { loading } = useProfile();
  if (loading) return <div style={{ padding: 16 }}>Chargement…</div>;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ProfileProvider>
        <AppGate>
          <Layout>
            <Routes>
              {/* Public / viewer */}
              <Route path="/" element={<Home />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/alerts/:id" element={<AlertsDetails />} />

              {/* CRUD accessibles à tous les rôles connectés */}
              <Route path="/clients" element={<Clients />} />
              <Route path="/transactions" element={<Transactions />} />

              {/* Reporting : admin ET analyst */}
              <Route
                path="/reports"
                element={
                  <RequireRole roles={["admin", "analyst"]}>
                    <Reports />
                  </RequireRole>
                }
              />
              <Route
                path="/imports"
                element={
                  <RequireRole roles={["admin", "analyst"]}>
                    <Imports />
                  </RequireRole>
                }
              />
              <Route
                path="/exports"
                element={
                  <RequireRole roles={["admin", "analyst"]}>
                    <Exports />
                  </RequireRole>
                }
              />
              <Route
                path="/anomalies"
                element={
                  <RequireRole roles={["admin", "analyst"]}>
                    <Anomalies />
                  </RequireRole>
                }
              />
              <Route
                path="/hubs"
                element={
                  <RequireRole roles={["admin", "analyst"]}>
                    <Hubs />
                  </RequireRole>
                }
              />

              {/* Graphe */}
              <Route
                path="/graph"
                element={
                  <RequireRole roles={["admin", "analyst"]}>
                    <Graph />
                  </RequireRole>
                }
              />

              {/* ✅ AI */}
              <Route
                path="/ai"
                element={
                  <RequireRole roles={["admin", "analyst"]}>
                    <AI />
                  </RequireRole>
                }
              />

              {/* Auth */}
              <Route path="/auth" element={<Auth />} />

              {/* 404 */}
              <Route path="*" element={<div style={{ padding: 16 }}>404</div>} />
            </Routes>
          </Layout>
        </AppGate>
      </ProfileProvider>
    </BrowserRouter>
  );
}
