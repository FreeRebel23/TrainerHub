import { describe, it, expect } from "vitest";
import { parsePlanRows, mySessions } from "./io.js";

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
