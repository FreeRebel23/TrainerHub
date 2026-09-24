import { describe, it, expect } from "vitest";
import { nextEntry, flowSteps, HOME } from "./nav.js";

describe("Navigation", () => {
  it("neue Ebene erhöht die Tiefe, Tab-Wechsel setzt sie zurück", () => {
    const a = nextEntry(HOME, "training");
    const b = nextEntry(a, "session_detail", { sessionId: "s1" });
    expect([a.depth, b.depth]).toEqual([1, 2]);
    expect(nextEntry(b, "teams", {}, { root: true }).depth).toBe(0);
  });

  it("replace behält die Tiefe (Filter, Ansichtsmodus, Bearbeiten-Abschluss)", () => {
    const e = { view: "training", params: { q: "" }, depth: 1 };
    expect(nextEntry(e, "training", { q: "press" }, { replace: true })).toEqual({ view: "training", params: { q: "press" }, depth: 1 });
  });

  it("Erfassen-Abschluss verlässt nie mehr Schritte als vorhanden", () => {
    expect(flowSteps(2, 2)).toBe(2);   // Start → Schritt 1 → Schritt 2
    expect(flowSteps(2, 1)).toBe(1);   // nach Reload nur ein Schritt im Verlauf
    expect(flowSteps(1, 0)).toBe(0);   // kein Verlauf → ersetzen statt zurückspringen
  });
});
