import { useEffect, useRef, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

// Kapselt die Service-Worker-Update-Logik von vite-plugin-pwa.
// Liefert den Zustand für Update-Banner und den manuellen "Auf Updates prüfen"-Button.
// Wichtig: betrifft nur den App-Code — gespeicherte Daten (localStorage) bleiben unberührt.
export function usePwaUpdate() {
  const regRef = useRef(null);
  const [checking, setChecking] = useState(false);
  const [upToDate, setUpToDate] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) { regRef.current = r ?? null; },
  });

  // needRefresh aktuell halten, damit der Timeout in checkForUpdate den
  // korrekten Wert sieht (Closure würde sonst veralten).
  const needRefreshRef = useRef(needRefresh);
  needRefreshRef.current = needRefresh;

  // Sobald ein Update gefunden wird, "Du bist aktuell"-Hinweis zurücknehmen.
  useEffect(() => { if (needRefresh) setUpToDate(false); }, [needRefresh]);

  async function checkForUpdate() {
    setUpToDate(false);
    setChecking(true);
    try { await regRef.current?.update(); } catch { /* offline o.Ä. — ignorieren */ }
    setTimeout(() => {
      setChecking(false);
      if (!needRefreshRef.current) setUpToDate(true);
    }, 2500);
  }

  function applyUpdate() {
    // Banner sofort ausblenden (optimistisch) — sonst bleibt es stehen, wenn der
    // automatische Reload ausbleibt.
    setNeedRefresh(false);
    // Fallback unabhängig planen: manche Umgebungen (v.a. iOS-Standalone-PWA)
    // führen den automatischen Reload von updateServiceWorker(true) nicht aus.
    // Greift der automatische Reload doch, ist die Seite längst weg und der
    // Timer irrelevant.
    setTimeout(() => window.location.reload(), 1500);
    updateServiceWorker(true).catch(() => {});
  }

  return {
    needRefresh,                              // true → neue Version liegt bereit
    checking,                                 // läuft gerade eine Prüfung?
    upToDate,                                 // letzte Prüfung ergab: aktuell
    checkForUpdate,                           // manuelle Prüfung anstoßen
    applyUpdate,                              // aktivieren + App neu laden
  };
}
