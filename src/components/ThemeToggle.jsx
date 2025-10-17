import { useEffect, useState } from "react";

const THEME_KEY = "ct_theme";
const GLASS = "ultra-glass";

export default function ThemeToggle() {
  const [isGlass, setIsGlass] = useState(false);

  // init depuis localStorage -> applique sur <html>
  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY);
    const enabled = saved === GLASS;
    setIsGlass(enabled);
    const html = document.documentElement;
    if (enabled) html.setAttribute("data-theme", GLASS);
    else html.removeAttribute("data-theme");
  }, []);

  function toggle() {
    const html = document.documentElement;
    if (isGlass) {
      html.removeAttribute("data-theme");
      localStorage.removeItem(THEME_KEY);
      setIsGlass(false);
    } else {
      html.setAttribute("data-theme", GLASS);
      localStorage.setItem(THEME_KEY, GLASS);
      setIsGlass(true);
    }
  }

  return (
    <button className={"btn" + (isGlass ? " primary" : "")} onClick={toggle} title="Activer le thème Ultra Verre">
      {isGlass ? "✓ Ultra Verre" : "Activer Ultra Verre"}
    </button>
  );
}
