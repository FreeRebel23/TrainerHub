// React-Anbindung. Die Views sehen wie bisher nur { data, update }; ob die Daten gerade lokal,
// auf dem Server oder beides sind, weiß nur der SyncController.
import { useEffect, useSyncExternalStore } from "react";
import { SyncController, viewData } from "./controller.js";

// Servermodus ist eine Build-Entscheidung. Ohne VITE_SYNC_SERVER bleibt TrainerHub rein lokal
// (heutige GitHub-Pages-Produktion). "same-origin": PocketBase unter derselben Domain (/api).
export function serverUrl(env = import.meta.env, loc = globalThis.location) {
  const v = (env?.VITE_SYNC_SERVER ?? "").trim();
  if (!v) return null;
  if (v === "same-origin") return loc?.origin ?? null;
  return v.replace(/\/+$/, "");
}

let controller = null;
export function getController() {
  if (!controller) controller = new SyncController({ serverUrl: serverUrl() });
  return controller;
}

export function useAppData() {
  const c = getController();
  useSyncExternalStore(c.subscribe.bind(c), () => c.getVersion());

  // Sync-Zeitpunkte: Start, Rückkehr in den Vordergrund, wieder online. Kein Polling.
  useEffect(() => {
    if (!c.client) return;
    c.resume();
    const onVisible = () => { if (document.visibilityState === "visible") c.sync().catch(() => {}); };
    const onOnline = () => c.sync().catch(() => {});
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [c]);

  return { data: viewOf(c), update: c.update, sync: c };
}

// Stabile Anzeige-Sicht je Datenstand (vermeidet unnötiges Neu-Rendern)
let lastIn = null, lastSection = null, lastOut = null;
function viewOf(c) {
  if (c.data !== lastIn || c.meta.sectionId !== lastSection) {
    lastIn = c.data; lastSection = c.meta.sectionId; lastOut = viewData(c.data, c.meta.sectionId);
  }
  return lastOut;
}
