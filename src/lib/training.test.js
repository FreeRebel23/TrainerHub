import { describe, it, expect } from "vitest";
import {
  content, planStatus, normalizeTags, normalizeDrill, drillMinutes, moveItem, byDateTime,
  duplicateAsPlan, sessionDraftFromPlan, planDefaults, knownTags, matchesQuery, seasonOverview,
  recordSession, removeSession,
} from "./training.js";

// Planung im alten Format (vor Phase 2): keine Uhrzeit, kein Inhalt
const legacyPlan = { id: "p1", teamId: "t", trainingTypeId: "bb", durationMinutes: 90, date: "2026-10-01", venueId: "v", recordedId: null };

const prepared = {
  ...legacyPlan, id: "p2", time: "18:30", focus: "Pressbreak gegen 2-2-1", tags: ["Transition", "Passspiel"],
  note: "Hütchen mitnehmen",
  checklist: [
    { id: "d1", text: "Aufwärmen", minutes: 15, done: true },
    { id: "d2", text: "3-gegen-2", minutes: 20, note: "Mitte besetzen" },
    { id: "d3", text: "Abschlussspiel" },
  ],
};

describe("Planungen – Kompatibilität und Status", () => {
  it("alte Planungen ohne neue Felder werden mit Defaults gelesen", () => {
    expect(content(legacyPlan)).toEqual({ time: "", focus: "", tags: [], checklist: [], note: "" });
  });

  it("Status wird aus den Daten abgeleitet", () => {
    expect(planStatus(legacyPlan)).toBe("planned");
    expect(planStatus({ ...legacyPlan, focus: "Defense" })).toBe("prepared");
    expect(planStatus({ ...legacyPlan, checklist: [{ id: "x", text: "Drill" }] })).toBe("prepared");
    expect(planStatus({ ...prepared, recordedId: "s1" })).toBe("done");
    expect(planStatus({ ...legacyPlan, focus: "   " })).toBe("planned");
  });

  it("sortiert nach Datum und Uhrzeit, ohne Uhrzeit ans Tagesende", () => {
    const list = [
      { date: "2026-10-02", time: "" }, { date: "2026-10-01", time: "19:00" },
      { date: "2026-10-01", time: "" }, { date: "2026-10-01", time: "17:30" },
    ].sort(byDateTime);
    expect(list.map(x => x.date + " " + x.time)).toEqual(["2026-10-01 17:30", "2026-10-01 19:00", "2026-10-01 ", "2026-10-02 "]);
  });
});

describe("Themen und Übungen", () => {
  it("Themen werden getrimmt und ohne Groß-/Kleinschreibungs-Dubletten gespeichert", () => {
    expect(normalizeTags([" Defense ", "defense", "", "Ball  handling", null])).toEqual(["Defense", "Ball handling"]);
  });

  it("Übungen: Minuten nur als positive Ganzzahl, Beschreibung optional", () => {
    expect(normalizeDrill({ id: "a", text: " Shell ", minutes: "12.4" })).toEqual({ id: "a", text: "Shell", done: false, minutes: 12 });
    expect(normalizeDrill({ id: "b", text: "X", minutes: "" })).toEqual({ id: "b", text: "X", done: false });
    expect(normalizeDrill({ id: "c", text: "X", minutes: 0, note: "n" })).toEqual({ id: "c", text: "X", done: false, note: "n" });
  });

  it("summiert nur Übungen mit Dauer", () => {
    expect(drillMinutes(prepared.checklist)).toBe(35);
    expect(drillMinutes(undefined)).toBe(0);
  });

  it("Reihenfolge: hoch/runter, an den Rändern unverändert", () => {
    const l = ["a", "b", "c"];
    expect(moveItem(l, 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveItem(l, 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(l, 0, -1)).toBe(l);
    expect(moveItem(l, 2, 1)).toBe(l);
  });
});

describe("Wiederverwenden", () => {
  it("Duplizieren übernimmt Inhalt und Reihenfolge, aber nicht Datum und Erledigt-Status", () => {
    const d = duplicateAsPlan(prepared);
    expect(d.id).not.toBe(prepared.id);
    expect(d.date).toBe("");
    expect(d.recordedId).toBeNull();
    expect([d.time, d.focus, d.tags, d.note]).toEqual(["18:30", "Pressbreak gegen 2-2-1", ["Transition", "Passspiel"], "Hütchen mitnehmen"]);
    expect(d.checklist.map(x => [x.text, x.minutes, x.done])).toEqual([["Aufwärmen", 15, false], ["3-gegen-2", 20, false], ["Abschlussspiel", undefined, false]]);
    expect(d.checklist.map(x => x.id)).not.toContain("d1");
    expect(d.checklist[1].note).toBe("Mitte besetzen");
    d.tags.push("X");
    expect(prepared.tags).toHaveLength(2);   // keine geteilte Referenz
  });

  it("Duplizieren eines erfassten Trainings übernimmt keine Anwesenheit und keine Beobachtung", () => {
    const session = { ...prepared, id: "s1", attendance: [{ playerId: "a", status: "present" }], note: "Gute Intensität", factor: 1.5, erfasstVon: "Florian", planId: "p2" };
    const d = duplicateAsPlan(session, { isSession: true, date: "2026-10-08" });
    expect(d).not.toHaveProperty("attendance");
    expect(d).not.toHaveProperty("erfasstVon");
    expect(d).not.toHaveProperty("planId");
    expect(d.note).toBe("");
    expect(d.date).toBe("2026-10-08");
    expect(d.checklist.every(x => !x.done)).toBe(true);
  });

  it("alte Trainings ohne neue Felder lassen sich duplizieren", () => {
    const old = { id: "s0", teamId: "t", trainingTypeId: "bb", durationMinutes: 75, date: "2025-11-02", venueId: null,
      attendance: [], note: "alt", checklist: [{ id: "c", text: "Freiwürfe", done: true }] };
    const d = duplicateAsPlan(old, { isSession: true });
    expect(d).toMatchObject({ time: "", focus: "", tags: [], durationMinutes: 75 });
    expect(d.checklist).toEqual([{ id: d.checklist[0].id, text: "Freiwürfe", done: false }]);
  });

  it("Durchführen übernimmt den vorbereiteten Inhalt unerledigt und verweist auf die Planung", () => {
    const s = sessionDraftFromPlan(prepared);
    expect(s).toMatchObject({ planId: "p2", time: "18:30", focus: "Pressbreak gegen 2-2-1", date: "2026-10-01" });
    expect(s.checklist.map(d => d.done)).toEqual([false, false, false]);
    expect(prepared.checklist[0].done).toBe(true);   // Planung bleibt unverändert
  });
});

describe("Defaults für neue Planungen", () => {
  const data = {
    teams: [{ id: "a" }, { id: "b" }],
    trainingTypes: [{ id: "bb", duration: 90 }, { id: "fit", duration: 60 }],
    venues: [{ id: "v1" }, { id: "v2" }],
    sessions: [
      { teamId: "b", date: "2026-09-24", trainingTypeId: "fit", durationMinutes: 60, venueId: "v2", time: "17:00" }, // Do
      { teamId: "b", date: "2026-09-22", trainingTypeId: "bb", durationMinutes: 90, venueId: "v1", time: "18:30" }, // Di
    ],
    plannedSessions: [],
  };

  it("zuletzt verwendetes Team, Werte vom gleichen Wochentag", () => {
    expect(planDefaults(data, { date: "2026-09-29" })).toEqual({ teamId: "b", trainingTypeId: "bb", durationMinutes: 90, venueId: "v1", time: "18:30" });
  });

  it("ohne passenden Wochentag: letzte Einheit des Teams", () => {
    expect(planDefaults(data, { date: "2026-09-27" })).toMatchObject({ trainingTypeId: "fit", time: "17:00" });
  });

  it("leerer Datenstand: erste Stammdaten, keine Uhrzeit", () => {
    expect(planDefaults({ ...data, sessions: [] }, {})).toEqual({ teamId: "a", trainingTypeId: "bb", durationMinutes: 90, venueId: "v1", time: "" });
  });

  it("bekannte Themen: verwendete zuerst, dann Vorschläge ohne Dubletten", () => {
    const tags = knownTags({ sessions: [{ tags: ["Pressbreak"] }, { tags: ["Pressbreak", "Defense"] }], plannedSessions: [] });
    expect(tags.slice(0, 2)).toEqual(["Pressbreak", "Defense"]);
    expect(tags.filter(t => t === "Defense")).toHaveLength(1);
  });
});

describe("Suche", () => {
  const data = { trainingTypes: [{ id: "bb", name: "Basketball" }], venues: [{ id: "v", name: "Jahnhalle" }], teams: [{ id: "t", name: "U16w" }] };
  it("findet Schwerpunkt, Themen, Übungen, Übungsbeschreibung, Notiz und Halle", () => {
    for (const q of ["pressbreak", "TRANSITION", "abschlussspiel", "mitte besetzen", "hütchen", "jahnhalle", "u16w"]) {
      expect(matchesQuery(prepared, q, data), q).toBe(true);
    }
    expect(matchesQuery(prepared, "zonenverteidigung", data)).toBe(false);
    expect(matchesQuery(legacyPlan, "", data)).toBe(true);
  });
});

describe("Saisonübersicht", () => {
  const s = (date, dur, tags = [], extra = {}) => ({ date, durationMinutes: dur, tags, checklist: [], attendance: [], ...extra });

  it("zählt Einheiten und Minuten je Thema, Monat und Schwerpunkt", () => {
    const o = seasonOverview([
      s("2026-09-01", 90, ["Defense", "Transition"], { focus: "Pressbreak" }),
      s("2026-09-03", 60, ["Defense"], { focus: "pressbreak " }),
      s("2026-10-02", 90, [], { focus: "Wurf" }),
      s("2026-10-05", 75),
    ]);
    expect(o.count).toBe(4);
    expect(o.minutes).toBe(315);
    expect(o.tags).toEqual([{ tag: "Defense", count: 2, minutes: 150 }, { tag: "Transition", count: 1, minutes: 90 }]);
    expect(o.untagged).toBe(2);
    expect(o.months).toEqual([{ month: "2026-09", count: 2, minutes: 150 }, { month: "2026-10", count: 2, minutes: 165 }]);
    expect(o.focus[0]).toEqual({ text: "Pressbreak", count: 2 });
  });

  it("Übungen und Anwesenheit nur aus vorhandenen Daten", () => {
    const o = seasonOverview([
      s("2026-09-01", 90, [], { checklist: [{ done: true }, { done: false }], attendance: [{ status: "present" }, { status: "absent" }] }),
      s("2026-09-02", 90),   // ohne Anwesenheit → zählt nicht in die Quote
    ]);
    expect(o.drills).toEqual({ planned: 2, done: 1 });
    expect(o.attendanceRate).toBe(50);
    expect(seasonOverview([]).attendanceRate).toBeNull();
  });
});

describe("Kopien sind unabhängig vom Original", () => {
  it("Duplikat: Ändern von Übungen und Themen verändert die Quelle nicht", () => {
    const d = duplicateAsPlan(prepared);
    d.checklist[0].text = "geändert"; d.checklist[0].done = true; d.checklist.push({ id: "n", text: "neu" });
    expect(prepared.checklist[0]).toEqual({ id: "d1", text: "Aufwärmen", minutes: 15, done: true });
    expect(prepared.checklist).toHaveLength(3);
  });

  it("Duplikat einer bereits durchgeführten Planung ist eine offene Planung mit neuen IDs", () => {
    const d = duplicateAsPlan({ ...prepared, recordedId: "s9" });
    expect(d.recordedId).toBeNull();
    expect(planStatus(d)).toBe("prepared");
    expect(new Set(d.checklist.map(x => x.id)).size).toBe(3);
    expect(d.checklist.some(x => ["d1", "d2", "d3"].includes(x.id))).toBe(false);
  });

  it("Durchführen: Änderungen im Training verändern die Planung nicht", () => {
    const s = sessionDraftFromPlan(prepared);
    s.checklist[1].done = true; s.checklist[1].text = "anders"; s.tags.push("Neu");
    expect(prepared.checklist[1]).toEqual({ id: "d2", text: "3-gegen-2", minutes: 20, note: "Mitte besetzen" });
    expect(prepared.tags).toEqual(["Transition", "Passspiel"]);
  });
});

describe("Abschließen und Löschen – Verknüpfung Planung ↔ Training", () => {
  const base = () => ({ sessions: [], plannedSessions: [{ ...legacyPlan }, { ...prepared }] });
  const sess = (id, planId) => ({ id, date: "2026-10-01", teamId: "t", durationMinutes: 90, attendance: [], ...(planId ? { planId } : {}) });

  it("verknüpft Planung und Training in beide Richtungen", () => {
    const d = recordSession(base(), sess("s1", "p2"));
    expect(d.sessions.map(s => s.id)).toEqual(["s1"]);
    expect(d.plannedSessions.find(p => p.id === "p2").recordedId).toBe("s1");
    expect(d.plannedSessions.find(p => p.id === "p1").recordedId).toBeNull();
  });

  it("Doppeltipp auf „Abschließen“ speichert das Training nur einmal", () => {
    const once = recordSession(base(), sess("s1", "p2"));
    const twice = recordSession(once, sess("s1", "p2"));
    expect(twice).toBe(once);
    expect(twice.sessions).toHaveLength(1);
  });

  it("zweites Training zur selben Planung: gespeichert, bestehende Verknüpfung bleibt", () => {
    const d = recordSession(recordSession(base(), sess("s1", "p2")), sess("s2", "p2"));
    expect(d.sessions.map(s => s.id)).toEqual(["s1", "s2"]);
    expect(d.plannedSessions.find(p => p.id === "p2").recordedId).toBe("s1");
  });

  it("Planung mit Verweis auf nicht mehr vorhandenes Training wird neu verknüpft", () => {
    const data = { sessions: [], plannedSessions: [{ ...prepared, recordedId: "weg" }] };
    expect(recordSession(data, sess("s3", "p2")).plannedSessions[0].recordedId).toBe("s3");
  });

  it("Training ohne Planung bzw. zu gelöschter Planung: kein Fehler, Planungen unverändert", () => {
    const b = base();
    expect(recordSession(b, sess("s1")).plannedSessions).toEqual(b.plannedSessions);
    expect(recordSession(b, sess("s1", "geloescht")).plannedSessions).toEqual(b.plannedSessions);
    expect(recordSession({ sessions: [] }, sess("s1", "p2")).sessions).toHaveLength(1);   // Altdaten ohne plannedSessions
  });

  it("Löschen eines Trainings öffnet die Planung wieder, andere bleiben unberührt", () => {
    const d = recordSession(recordSession(base(), sess("s1", "p2")), sess("s2"));
    const r = removeSession(d, "s1");
    expect(r.sessions.map(s => s.id)).toEqual(["s2"]);
    expect(r.plannedSessions.find(p => p.id === "p2").recordedId).toBeNull();
    expect(planStatus(r.plannedSessions.find(p => p.id === "p2"))).toBe("prepared");
    expect(d.sessions).toHaveLength(2);   // Eingabe nicht mutiert
  });
});

describe("Altdaten mit nur einem Teil der neuen Felder", () => {
  const partial = { id: "x", teamId: "t", trainingTypeId: "bb", durationMinutes: 60, date: "2026-10-03",
    tags: "Defense", checklist: [{ id: "c1" }, { id: "c2", text: null, note: 5 }], focus: undefined, time: null };

  it("Defaults greifen, Status, Suche und Auswertung stürzen nicht ab", () => {
    expect(content(partial)).toMatchObject({ tags: [], time: "", focus: "" });
    expect(planStatus(partial)).toBe("prepared");
    expect(() => matchesQuery(partial, "defense", {})).not.toThrow();
    expect(() => seasonOverview([partial])).not.toThrow();
    expect(duplicateAsPlan(partial).checklist.map(d => d.text)).toEqual(["", ""]);
  });
});

describe("Saisonübersicht – Schreibweisen", () => {
  it("Themen in unterschiedlicher Groß-/Kleinschreibung werden zusammengezählt", () => {
    const o = seasonOverview([
      { date: "2026-09-01", durationMinutes: 90, tags: ["Wurf"] },
      { date: "2026-09-02", durationMinutes: 60, tags: ["wurf", "Defense"] },
    ]);
    expect(o.tags).toEqual([{ tag: "Wurf", count: 2, minutes: 150 }, { tag: "Defense", count: 1, minutes: 60 }]);
    expect(o.untagged).toBe(0);
  });
});
