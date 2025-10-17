// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import "./styles/theme.css";
import "./styles/dashboard.css";

// Appliquer le thème dès le chargement
(() => {
  const saved = localStorage.getItem("theme");
  const html = document.documentElement;
  if (saved === "ultra-glass") html.setAttribute("data-theme", "ultra-glass");
  else html.removeAttribute("data-theme");
})();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
