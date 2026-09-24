import { useCallback, useEffect, useRef, useState } from "react";

// Minimale Navigation über die History-API ohne URL-Änderung (die App bleibt unter "./",
// wichtig für PWA-Scope und GitHub-Pages-Unterordner). Ergebnis:
//  - Browser-/Android-Zurück und iOS-Wischgeste funktionieren,
//  - ein Reload behält die aktuelle Ansicht (history.state überlebt Reloads),
//  - "Zurück" in der App führt dorthin, wo man herkam.
// depth = Anzahl App-interner Schritte seit dem letzten Tab-Wechsel.

const HOME = { view: "home", params: {}, depth: 0 };

function current() {
  const s = window.history.state;
  return s && typeof s.view === "string" ? s : null;
}

export function useNav() {
  const [nav, setNav] = useState(() => current() ?? HOME);
  const navRef = useRef(nav);
  navRef.current = nav;
  const pending = useRef(null);

  useEffect(() => {
    if (!current()) window.history.replaceState(HOME, "");
    const onPop = e => {
      const s = e.state && e.state.view ? e.state : HOME;
      if (pending.current) {
        // finishFlow: nach dem Zurückspringen das Ziel als neue Ebene anlegen
        const next = { ...pending.current, depth: s.depth + 1 };
        pending.current = null;
        window.history.pushState(next, "");
        navRef.current = next;
        setNav(next);
        return;
      }
      navRef.current = s;
      setNav(s);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // go(view, params)                → neue Ebene (Zurück führt hierher zurück)
  // go(view, params, { replace })   → aktuelle Ebene ersetzen (z. B. nach dem Speichern)
  // go(view, params, { root })      → Tab-Wechsel, Tiefe 0
  const go = useCallback((view, params = {}, opts = {}) => {
    const prev = navRef.current;
    const depth = opts.root ? 0 : opts.replace ? prev.depth : prev.depth + 1;
    const next = { view, params, depth };
    if (opts.replace) window.history.replaceState(next, "");
    else window.history.pushState(next, "");
    navRef.current = next;
    setNav(next);
    window.scrollTo(0, 0);
  }, []);

  // Zurück: echter History-Schritt, wenn es einen gibt, sonst zur Eltern-Ansicht
  const back = useCallback((fallbackView = "home", fallbackParams = {}) => {
    if (navRef.current.depth > 0) window.history.back();
    else go(fallbackView, fallbackParams, { replace: true });
  }, [go]);

  // Mehrstufigen Ablauf (z. B. Erfassen-Assistent) abschließen: die `steps` Einträge des
  // Ablaufs verlassen und das Ergebnis öffnen. Zurück führt danach dorthin, wo der Ablauf begann.
  const finishFlow = useCallback((steps, view, params = {}) => {
    const n = Math.min(steps, navRef.current.depth);
    if (n <= 0) { go(view, params, { replace: true }); return; }
    pending.current = { view, params };
    window.history.go(-n);
    window.scrollTo(0, 0);
  }, [go]);

  return { nav, go, back, finishFlow };
}
