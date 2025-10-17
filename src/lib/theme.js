const THEME_KEY = "ct_theme";

export function applyTheme(theme) {
  const root = document.documentElement; // <html>
  root.classList.remove("theme-default", "theme-ultra");
  root.classList.add(theme === "ultra" ? "theme-ultra" : "theme-default");
  localStorage.setItem(THEME_KEY, theme);
}

export function getSavedTheme() {
  return localStorage.getItem(THEME_KEY) || "default";
}
