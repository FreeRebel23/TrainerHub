import { describe, it, expect } from "vitest";
import { parsePlanRows, mySessions, trainingLogRows } from "./io.js";

const data = {
  teams: [{ id: "t", name: "U16" }],
  trainingTypes: [{ id: "bb", name: "Basketball" }],
  venues: [{ id: "v", name: "Jahnhalle" }],
};
const XLSX = { SSF: { parse_date_code: n => ({ y: 2026, m: 9, d: n - 46266 + 1 }) } };

describe("Trainingsplan-Import", () => {
  it("liest Zeilen, ordnet Art und Halle zu und überspringt die Kopfzeile", () => {
    const plans = parsePlanRows([
      ["Datum", "Trainingstyp", "Dauer_min", "Halle"],
      ["2026-09-02", "basketball", "75", "Jahnhalle"],
      ["2026-09-05", "Unbekannt", "", ""],
      ["", "Basketball", "90", ""],
    ], data, "t", XLSX);
    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({ date: "2026-09-02", teamId: "t", trainingTypeId: "bb", durationMinutes: 75, venueId: "v", recordedId: null });
    expect(plans[1]).toMatchObject({ trainingTypeId: "", durationMinutes: 90 });
  });

  it("wandelt Excel-Seriendaten um", () => {
    const [p] = parsePlanRows([["h"], ["46266"]], data, "t", XLSX);
    expect(p.date).toBe("2026-09-01");
  });
});

describe("Sync", () => {
  it("exportiert nur eigene bzw. unmarkierte Trainings", () => {
    const d = { settings: { trainerName: "Florian" }, sessions: [
      { id: 1, erfasstVon: "Florian" }, { id: 2, erfasstVon: "Rüdiger" }, { id: 3 }] };
    expect(mySessions(d).map(s => s.id)).toEqual([1, 3]);
  });
});

describe("Trainingsplan-Import (Phase 2)", () => {
  it("erkennt Spalten über die Kopfzeile in beliebiger Reihenfolge inkl. neuer Felder", () => {
    const plans = parsePlanRows([
      ["Uhrzeit", "Datum", "Schwerpunkt", "Trainingstyp", "Dauer_min", "Halle", "Themen", "Notiz"],
      ["18:30", "2026-10-01", "Pressbreak", "Basketball", "75", "Jahnhalle", "Transition; passspiel", "Hütchen"],
      ["7.05", "2026-10-02", "", "Basketball", "", "", "", ""],
      ["25:00", "2026-10-03", "", "", "", "", "", ""],
    ], data, "t", XLSX);
    expect(plans[0]).toMatchObject({ date: "2026-10-01", time: "18:30", focus: "Pressbreak", trainingTypeId: "bb",
      durationMinutes: 75, venueId: "v", tags: ["Transition", "passspiel"], note: "Hütchen" });
    expect(plans[1]).toMatchObject({ time: "07:05", durationMinutes: 90, venueId: null });
    expect(plans[1]).not.toHaveProperty("focus");
    expect(plans[2]).not.toHaveProperty("time");       // ungültige Uhrzeit wird ignoriert
  });

  it("Excel-Zeitwerte (Bruchteil eines Tages) werden zur Uhrzeit", () => {
    const [p] = parsePlanRows([["Datum", "Uhrzeit"], ["2026-10-01", 0.770833333]], data, "t", XLSX);
    expect(p.time).toBe("18:30");
  });

  it("alte Dateien ohne erkannte Kopfzeile nutzen die feste Reihenfolge und behalten jetzt die Notiz", () => {
    const [p] = parsePlanRows([["Tag", "Art", "Min", "Ort", "Info"], ["2026-10-01", "Basketball", "60", "", "Saisonstart"]], data, "t", XLSX);
    expect(p).toMatchObject({ date: "2026-10-01", trainingTypeId: "bb", durationMinutes: 60, venueId: null, note: "Saisonstart" });
    expect(p).not.toHaveProperty("time");
  });
});

describe("Trainingsbuch-Export", () => {
  it("enthält geplante und durchgeführte Einheiten chronologisch mit Inhalt", () => {
    const d = {
      ...data,
      sessions: [{ id: "s", teamId: "t", trainingTypeId: "bb", date: "2026-10-01", time: "18:30", durationMinutes: 90, venueId: "v",
        focus: "Pressbreak", tags: ["Transition"], note: "gut", checklist: [{ id: "a", text: "3-2", minutes: 20, done: true }, { id: "b", text: "Spiel", done: false }],
        attendance: [{ playerId: "x", status: "present" }, { playerId: "y", status: "absent" }] }],
      plannedSessions: [
        { id: "p0", teamId: "t", trainingTypeId: "bb", date: "2026-10-01", durationMinutes: 90, recordedId: "s" },   // erledigt → nicht doppelt
        { id: "p1", teamId: "t", trainingTypeId: "bb", date: "2026-09-30", durationMinutes: 60, venueId: null, recordedId: null },
      ],
    };
    const [hdr, ...rows] = trainingLogRows(d, "t");
    expect(hdr.slice(0, 3)).toEqual(["Datum", "Uhrzeit", "Status"]);
    expect(rows).toHaveLength(2);
    expect(rows[0].slice(0, 3)).toEqual(["2026-09-30", "", "geplant"]);
    expect(rows[1]).toEqual(["2026-10-01", "18:30", "durchgeführt", "U16", "Basketball", 90, "Jahnhalle", "Pressbreak",
      "Transition", "3-2 (20 min) | Spiel", "1/2", "1/2", "gut"]);
  });
});

describe("Sync und Backup mit Phase-2-Feldern", () => {
  it("Sync-Import übernimmt neue Felder unverändert", async () => {
    const { importSync } = await import("./io.js");
    const incoming = { sessions: [{ id: "n1", date: "2026-10-01", focus: "Defense", tags: ["Defense"], time: "18:00",
      planId: "p9", checklist: [{ id: "a", text: "Shell", minutes: 15, note: "laut", done: true }] }] };
    globalThis.FileReader = class { readAsText(f) { this.onload({ target: { result: f } }); } };
    let state = { sessions: [] };
    await new Promise(res => importSync(JSON.stringify(incoming), state, fn => { state = fn(state); }, res));
    expect(state.sessions[0]).toEqual(incoming.sessions[0]);
  });

  it("Backup mit Phase-2-Daten lässt sich unverändert wiederherstellen", async () => {
    const { readBackup } = await import("./io.js");
    const backup = { teams: [], players: [], trainingTypes: [], venues: [], seasons: [], settings: { trainerName: "" },
      sessions: [{ id: "s", focus: "X", tags: ["A"], planId: "p", checklist: [{ id: "a", text: "t", minutes: 5, done: false }] }],
      plannedSessions: [{ id: "p", date: "2026-10-01", time: "18:30", focus: "X", tags: ["A"], note: "n", checklist: [], recordedId: "s" }] };
    globalThis.FileReader = class { readAsText(f) { this.onload({ target: { result: f } }); } };
    const restored = await new Promise((res, rej) => readBackup(JSON.stringify(backup), res, rej));
    expect(restored).toEqual(backup);
  });

  it("Backup aus Phase 1 (ohne neue Felder) wird unverändert geladen", async () => {
    const { readBackup } = await import("./io.js");
    const phase1 = { teams: [{ id: "t", name: "U16", playerIds: [] }], players: [], trainingTypes: [{ id: "bb", name: "Basketball", duration: 90, emoji: "🏀" }],
      venues: [{ id: "v", name: "Halle", address: "", emoji: "🏠" }], seasons: [], settings: { trainerName: "F" },
      sessions: [{ id: "s", teamId: "t", date: "2026-05-01", attendance: [], note: "alt", checklist: [{ id: "c", text: "x", done: true }] }],
      plannedSessions: [{ id: "p", teamId: "t", trainingTypeId: "bb", durationMinutes: 90, date: "2026-10-01", venueId: "v", recordedId: null }] };
    globalThis.FileReader = class { readAsText(f) { this.onload({ target: { result: f } }); } };
    const restored = await new Promise((res, rej) => readBackup(JSON.stringify(phase1), res, rej));
    expect(restored).toEqual(phase1);
  });
});
