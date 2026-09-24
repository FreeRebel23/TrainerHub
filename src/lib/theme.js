import { useEffect, useState } from "react";

// Theme-Präferenz: "system" | "light" | "dark". Wird getrennt von den Trainingsdaten
// gespeichert, damit Backups/Sync davon unberührt bleiben. Das initiale Setzen vor dem
// ersten Rendern übernimmt ein Inline-Script in index.html (kein Aufblitzen).

const KEY = "trainerhub_theme";
const META_COLORS = { light: "#fafaf9", dark: "#1a1918" };

function readPref() {
  try { return localStorage.getItem(KEY) || "system"; } catch { return "system"; }
}

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

export function resolveTheme(pref) {
  if (pref === "light" || pref === "dark") return pref;
  return media().matches ? "dark" : "light";
}

function apply(pref) {
  const theme = resolveTheme(pref);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", META_COLORS[theme]);
  return theme;
}

export function useTheme() {
  const [pref, setPref] = useState(readPref);
  const [theme, setTheme] = useState(() => resolveTheme(readPref()));

  useEffect(() => {
    setTheme(apply(pref));
    try { localStorage.setItem(KEY, pref); } catch { /* privater Modus */ }
    if (pref !== "system") return;
    const mq = media();
    const onChange = () => setTheme(apply("system"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  // Schneller Wechsel (Sidebar): immer auf das jeweils andere Theme
  const toggle = () => setPref(theme === "dark" ? "light" : "dark");

  return { pref, setPref, theme, toggle };
}
