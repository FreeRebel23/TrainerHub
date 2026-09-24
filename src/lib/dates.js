// Datumshelfer. Alle Daten werden als lokales Kalenderdatum "YYYY-MM-DD" gespeichert.
// Wichtig: nie toISOString() für Kalendertage verwenden — das rechnet nach UTC um und
// verschiebt in Deutschland den Tag (Mitternacht lokal = 22/23 Uhr UTC am Vortag).

export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayISO() { return toISODate(new Date()); }

export function parseISO(iso) { return new Date(iso + "T12:00:00"); }

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function fmtDate(iso) {
  return parseISO(iso).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
}
export function fmtDateFull(iso) {
  return parseISO(iso).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
}
export function fmtDateLong(iso) {
  return parseISO(iso).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}
export function fmtDayMonth(iso) {
  return parseISO(iso).toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}
export function fmtWeekdayShort(iso) {
  return parseISO(iso).toLocaleDateString("de-DE", { weekday: "short" }).replace(".", "");
}

// "Heute", "Morgen", "Gestern" oder kurzes Datum
export function fmtRelative(iso, today = todayISO()) {
  if (iso === today) return "Heute";
  if (iso === addDays(today, 1)) return "Morgen";
  if (iso === addDays(today, -1)) return "Gestern";
  return fmtDate(iso);
}

// Nur "Heute"/"Morgen"/"Gestern", sonst null (wenn das Datum schon sichtbar ist)
export function relativeDay(iso, today = todayISO()) {
  const r = fmtRelative(iso, today);
  return ["Heute", "Morgen", "Gestern"].includes(r) ? r : null;
}

export const MONTHS_DE = ["Januar","Februar","März","April","Mai","Juni",
                          "Juli","August","September","Oktober","November","Dezember"];
export const WEEKDAYS  = ["Mo","Di","Mi","Do","Fr","Sa","So"];

// 6 Wochen × 7 Tage, beginnend am Montag vor dem Monatsersten
export function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1);
  const startDow = (firstDay.getDay() + 6) % 7;   // 0=Mo, 6=So
  const grid = [];
  for (let i = 0; i < 42; i++) {
    grid.push(toISODate(new Date(year, month, 1 - startDow + i)));
  }
  return grid;
}

// ─── Feiertage & Schulferien Baden-Württemberg ───

export const BAWUE_HOLIDAYS = {
  // 2025
  "2025-01-01": "Neujahr",
  "2025-01-06": "Heilige Drei Könige",
  "2025-04-18": "Karfreitag",
  "2025-04-20": "Ostersonntag",
  "2025-04-21": "Ostermontag",
  "2025-05-01": "Tag der Arbeit",
  "2025-05-29": "Christi Himmelfahrt",
  "2025-06-08": "Pfingstsonntag",
  "2025-06-09": "Pfingstmontag",
  "2025-06-19": "Fronleichnam",
  "2025-10-03": "Tag der Deutschen Einheit",
  "2025-11-01": "Allerheiligen",
  "2025-12-25": "1. Weihnachtstag",
  "2025-12-26": "2. Weihnachtstag",
  // 2026
  "2026-01-01": "Neujahr",
  "2026-01-06": "Heilige Drei Könige",
  "2026-04-03": "Karfreitag",
  "2026-04-05": "Ostersonntag",
  "2026-04-06": "Ostermontag",
  "2026-05-01": "Tag der Arbeit",
  "2026-05-14": "Christi Himmelfahrt",
  "2026-05-24": "Pfingstsonntag",
  "2026-05-25": "Pfingstmontag",
  "2026-06-04": "Fronleichnam",
  "2026-10-03": "Tag der Deutschen Einheit",
  "2026-11-01": "Allerheiligen",
  "2026-12-25": "1. Weihnachtstag",
  "2026-12-26": "2. Weihnachtstag",
  // 2027
  "2027-01-01": "Neujahr",
  "2027-01-06": "Heilige Drei Könige",
};

// BaWü Schulferien – offizielle Termine laut Kultusministerium BaWü (km.baden-wuerttemberg.de/de/service/ferien)
export const BAWUE_SCHOOL_HOLIDAYS = [
  // Schuljahr 2024/2025
  { name: "Osterferien",       start: "2025-04-11", end: "2025-04-25" },
  { name: "Pfingstferien",     start: "2025-06-10", end: "2025-06-21" },
  // Schuljahr 2025/2026
  { name: "Sommerferien",      start: "2025-07-31", end: "2025-09-13" },
  { name: "Herbstferien",      start: "2025-10-27", end: "2025-10-31" }, // 31.10. = Reformationsfest, schulfrei
  { name: "Weihnachtsferien",  start: "2025-12-22", end: "2026-01-05" },
  { name: "Osterferien",       start: "2026-03-30", end: "2026-04-11" }, // amtlich: 30.03.–11.04.2026
  { name: "Pfingstferien",     start: "2026-05-26", end: "2026-06-05" }, // amtlich: 26.05.–05.06.2026
  // Schuljahr 2026/2027
  { name: "Sommerferien",      start: "2026-07-30", end: "2026-09-12" },
  { name: "Herbstferien",      start: "2026-10-26", end: "2026-10-31" }, // 31.10. = Reformationsfest, schulfrei
  { name: "Weihnachtsferien",  start: "2026-12-23", end: "2027-01-09" }, // amtlich: 23.12.2026–09.01.2027
  { name: "Pfingstferien",     start: "2027-05-18", end: "2027-05-29" }, // amtlich: 18.05.–29.05.2027
];

export function getHoliday(iso) { return BAWUE_HOLIDAYS[iso] || null; }

export function getSchoolHoliday(iso) {
  return BAWUE_SCHOOL_HOLIDAYS.find(h => iso >= h.start && iso <= h.end) || null;
}
