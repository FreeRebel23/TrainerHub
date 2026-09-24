import { describe, it, expect } from "vitest";
import { draftKey, saveDraft, loadDraft, clearDraft } from "./draft.js";

function memory() {
  const m = new Map();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) };
}

describe("Entwurf des laufenden Trainings", () => {
  it("stellt den Entwurf für dieselbe Planung wieder her", () => {
    const st = memory();
    saveDraft(draftKey({ planId: "p1" }), { note: "läuft" }, st, 1000);
    expect(loadDraft("plan:p1", st, 2000)).toEqual({ note: "läuft" });
  });

  it("liefert nichts für eine andere Einheit oder nach 18 Stunden", () => {
    const st = memory();
    saveDraft("plan:p1", { note: "x" }, st, 0);
    expect(loadDraft("plan:p2", st, 10)).toBeNull();
    expect(loadDraft("plan:p1", st, 19 * 3600 * 1000)).toBeNull();
  });

  it("ungeplante Trainings sind nach Datum getrennt, Löschen entfernt den Entwurf", () => {
    const st = memory();
    expect(draftKey({ date: "2026-10-01" })).toBe("new:2026-10-01");
    saveDraft("new:2026-10-01", { a: 1 }, st, 0);
    clearDraft(st);
    expect(loadDraft("new:2026-10-01", st, 1)).toBeNull();
  });

  it("defekter Speicher führt nicht zu einem Fehler", () => {
    const st = { getItem: () => "{kaputt", setItem: () => { throw new Error("voll"); }, removeItem: () => {} };
    expect(loadDraft("plan:p1", st)).toBeNull();
    expect(() => saveDraft("plan:p1", {}, st)).not.toThrow();
  });
});
