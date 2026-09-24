import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Minimale Navigation über die History-API ohne URL-Änderung (die App bleibt unter "./",
// wichtig für PWA-Scope und GitHub-Pages-Unterordner). Ergebnis:
//  - Browser-/Android-Zurück und iOS-Wischgeste funktionieren,
//  - ein Reload behält die aktuelle Ansicht (history.state überlebt Reloads),
//  - "Zurück" in der App führt dorthin, wo man herkam – inkl. Scrollposition.
// depth = Anzahl App-interner Schritte seit dem letzten Tab-Wechsel.

export const HOME = { view: "home", params: {}, depth: 0 };

// Reine Funktion: nächster History-Eintrag für go(view, params, opts)
export function nextEntry(prev, view, params = {}, opts = {}) {
  const depth = opts.root ? 0 : opts.replace ? prev.depth : prev.depth + 1;
  return { view, params, depth };
}

// Anzahl der Schritte, die ein Ablauf beim Abschluss verlassen kann
export function flowSteps(steps, depth) {
  return Math.max(0, Math.min(steps, depth));
}

function current() {
  const s = window.history.state;
  return s && typeof s.view === "string" ? s : null;
}

export function useNav() {
  const [nav, setNav] = useState(() => current() ?? HOME);
  const navRef = useRef(nav);
  navRef.current = nav;
  const pending = useRef(null);
  const restoreScroll = useRef(null);
  const popped = useRef(0);   // zählt popstate-Ereignisse (für den Rückfall ohne Verlauf)

  useEffect(() => {
    // Scrollposition selbst verwalten: der Browser stellt sie sonst her, bevor React
    // die Zielansicht gerendert hat, und landet an der falschen Stelle.
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    if (!current()) window.history.replaceState(HOME, "");
    const onPop = e => {
      popped.current++;
      const s = e.state && e.state.view ? e.state : HOME;
      if (pending.current) {
        // finishFlow: nach dem Zurückspringen das Ziel als neue Ebene anlegen
        const next = { ...pending.current, depth: s.depth + 1 };
        pending.current = null;
        window.history.pushState(next, "");
        navRef.current = next;
        restoreScroll.current = 0;
        setNav(next);
        return;
      }
      navRef.current = s;
      restoreScroll.current = s.scroll ?? 0;
      setNav(s);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Nach dem Rendern der Zielansicht scrollen
  useLayoutEffect(() => {
    if (restoreScroll.current === null) return;
    window.scrollTo(0, restoreScroll.current);
    restoreScroll.current = null;
  }, [nav]);

  // go(view, params)                → neue Ebene (Zurück führt hierher zurück)
  // go(view, params, { replace })   → aktuelle Ebene ersetzen (z. B. Filter, Ansichtsmodus)
  // go(view, params, { root })      → Tab-Wechsel, Tiefe 0
  const go = useCallback((view, params = {}, opts = {}) => {
    const prev = navRef.current;
    const next = nextEntry(prev, view, params, opts);
    if (opts.replace) {
      window.history.replaceState(next, "");
    } else {
      // Scrollposition der verlassenen Ansicht für "Zurück" merken
      window.history.replaceState({ ...prev, scroll: window.scrollY }, "");
      window.history.pushState(next, "");
      restoreScroll.current = 0;
    }
    navRef.current = next;
    setNav(next);
  }, []);

  // Browser-Verlauf zurückspringen. Fehlt der Verlauf trotz depth > 0 (z. B. nach dem
  // Wiederherstellen einer verworfenen Seite), kommt kein popstate – dann Rückfall.
  const historyGo = useCallback((n, fallback) => {
    const before = popped.current;
    window.history.go(-n);
    setTimeout(() => { if (popped.current === before) fallback(); }, 350);
  }, []);

  // Zurück: echter History-Schritt, wenn es einen gibt, sonst zur Eltern-Ansicht
  const back = useCallback((fallbackView = "home", fallbackParams = {}) => {
    const toParent = () => { restoreScroll.current = 0; go(fallbackView, fallbackParams, { replace: true }); };
    if (navRef.current.depth > 0) historyGo(1, toParent);
    else toParent();
  }, [go, historyGo]);

  // Mehrstufigen Ablauf (z. B. Erfassen-Assistent) abschließen: die `steps` Einträge des
  // Ablaufs verlassen und das Ergebnis öffnen. Zurück führt danach dorthin, wo der Ablauf begann.
  const finishFlow = useCallback((steps, view, params = {}) => {
    const n = flowSteps(steps, navRef.current.depth);
    if (n === 0) { restoreScroll.current = 0; go(view, params, { replace: true }); return; }
    pending.current = { view, params };
    historyGo(n, () => {
      pending.current = null;
      restoreScroll.current = 0;
      go(view, params, { replace: true });
    });
  }, [go, historyGo]);

  return { nav, go, back, finishFlow };
}
