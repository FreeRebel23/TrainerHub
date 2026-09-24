import { describe, it, expect, vi, afterEach } from "vitest";
import { toISODate, todayISO, buildMonthGrid, addDays, fmtRelative, getHoliday, getSchoolHoliday } from "./dates.js";

afterEach(() => vi.useRealTimers());

describe("Datumshelfer", () => {
  it("formatiert lokale Kalendertage ohne UTC-Verschiebung", () => {
    // Lokale Mitternacht – mit toISOString() wäre das in Deutschland der Vortag
    expect(toISODate(new Date(2026, 8, 24, 0, 5))).toBe("2026-09-24");
  });

  it("todayISO liefert kurz nach Mitternacht den neuen Tag", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 24, 0, 30));
    expect(todayISO()).toBe("2026-09-24");
  });

  it("Monatsraster beginnt am Montag und trifft die Wochentage", () => {
    const grid = buildMonthGrid(2026, 8); // September 2026, der 1. ist ein Dienstag
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe("2026-08-31");      // Montag
    expect(grid[1]).toBe("2026-09-01");      // Dienstag
    expect(grid.indexOf("2026-09-24") % 7).toBe(3); // Donnerstag-Spalte
  });

  it("addDays überschreitet Monats- und Jahresgrenzen", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26"); // Zeitumstellung
  });

  it("relative Datumsangaben", () => {
    expect(fmtRelative("2026-09-24", "2026-09-24")).toBe("Heute");
    expect(fmtRelative("2026-09-25", "2026-09-24")).toBe("Morgen");
    expect(fmtRelative("2026-09-23", "2026-09-24")).toBe("Gestern");
  });

  it("Feiertage und Schulferien BW", () => {
    expect(getHoliday("2026-10-03")).toBe("Tag der Deutschen Einheit");
    expect(getHoliday("2026-10-04")).toBeNull();
    expect(getSchoolHoliday("2026-10-28")?.name).toBe("Herbstferien");
    expect(getSchoolHoliday("2026-09-24")).toBeNull();
  });
});
