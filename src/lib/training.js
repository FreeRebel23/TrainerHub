// Fachlogik für den Trainingszyklus: planen → vorbereiten → durchführen → wiederverwenden →
// Saison verstehen. Reine Funktionen ohne UI. Neue Felder (time, focus, tags, checklist, note,
// planId) sind optional – ältere Datenstände werden beim Lesen mit Defaults behandelt und
// nicht umgeschrieben.

import { uid, isPresent } from "./data.js";

// Themen-Vorschläge. Eigene Themen entstehen einfach durch Verwendung.
export const TAG_SUGGESTIONS = [
  "Ballhandling", "Passspiel", "Wurf", "Abschluss", "Defense", "Offense",
  "Transition", "Rebounding", "Athletik", "Spielverständnis",
];

// ─── Normalisierung ───

export function normalizeTags(tags) {
  const seen = new Set();
  const out = [];
  (tags ?? []).forEach(t => {
    const v = String(t ?? "").trim().replace(/\s+/g, " ");
    const key = v.toLocaleLowerCase("de");
    if (v && !seen.has(key)) { seen.add(key); out.push(v); }
  });
  return out;
}

export function normalizeDrill(d) {
  const minutes = Number(d?.minutes);
  return {
    id: d?.id ?? uid(),
    text: String(d?.text ?? "").trim(),
    done: !!d?.done,
    ...(Number.isFinite(minutes) && minutes > 0 ? { minutes: Math.round(minutes) } : {}),
    ...(d?.note ? { note: String(d.note) } : {}),
  };
}

// Inhalt einer Planung/eines Trainings mit sicheren Defaults (nur lesend verwenden)
export function content(x) {
  return {
    time: x?.time ?? "",
    focus: x?.focus ?? "",
    tags: Array.isArray(x?.tags) ? x.tags : [],
    checklist: Array.isArray(x?.checklist) ? x.checklist : [],
    note: x?.note ?? "",
  };
}

// ─── Status (abgeleitet) ───

// "done" = durchgeführt, "prepared" = Schwerpunkt oder Übungen vorhanden, "planned" = nur Termin
export function planStatus(plan) {
  if (plan?.recordedId) return "done";
  const c = content(plan);
  return c.focus.trim() || c.checklist.length ? "prepared" : "planned";
}

export const STATUS_LABEL = { planned: "noch nicht vorbereitet", prepared: "vorbereitet", done: "durchgeführt" };

// ─── Übungen ───

export function drillMinutes(list) {
  return (list ?? []).reduce((s, d) => s + (Number(d.minutes) > 0 ? Number(d.minutes) : 0), 0);
}

export function moveItem(list, index, delta) {
  const to = index + delta;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item);
  return next;
}

// ─── Sortierung ───

// Nach Datum, dann Uhrzeit; ohne Uhrzeit ans Ende des Tages
export function byDateTime(a, b) {
  return a.date.localeCompare(b.date) || (a.time || "99:99").localeCompare(b.time || "99:99");
}

// ─── Wiederverwenden ───

// Neue Planung aus einer Planung oder einem erfassten Training.
// Übernimmt Rahmen und Inhalt, nicht aber Datum, Anwesenheit, Erledigt-Status und
// Beobachtungen (die Notiz eines erfassten Trainings ist eine Beobachtung).
export function duplicateAsPlan(src, { date = "", isSession = false } = {}) {
  const c = content(src);
  return {
    id: uid(),
    teamId: src.teamId,
    trainingTypeId: src.trainingTypeId,
    durationMinutes: src.durationMinutes,
    venueId: src.venueId ?? null,
    date,
    time: c.time,
    focus: c.focus,
    tags: [...c.tags],
    checklist: c.checklist.map(d => ({ ...normalizeDrill(d), id: uid(), done: false })),
    note: isSession ? "" : c.note,
    recordedId: null,
  };
}

// Vorbereiteter Inhalt einer Planung als Startpunkt für das Durchführen
export function sessionDraftFromPlan(plan) {
  const c = content(plan);
  return {
    date: plan.date,
    time: c.time,
    teamId: plan.teamId,
    trainingTypeId: plan.trainingTypeId,
    durationMinutes: plan.durationMinutes,
    venueId: plan.venueId ?? null,
    focus: c.focus,
    tags: [...c.tags],
    checklist: c.checklist.map(d => ({ ...normalizeDrill(d), done: false })),
    planId: plan.id,
  };
}

// ─── Abschließen und Löschen ───

// Erfasstes Training übernehmen und die Planung (sess.planId) als durchgeführt verknüpfen.
// Idempotent: Ein zweiter Aufruf mit demselben Training (Doppeltipp) ändert nichts. Ist die
// Planung bereits mit einem vorhandenen Training verknüpft, bleibt diese Verknüpfung bestehen –
// das neue Training wird trotzdem gespeichert (nie Daten verwerfen).
export function recordSession(data, sess) {
  const sessions = data.sessions ?? [];
  if (sessions.some(s => s.id === sess.id)) return data;
  const next = { ...data, sessions: [...sessions, sess] };
  if (sess.planId) {
    next.plannedSessions = (data.plannedSessions ?? []).map(p =>
      p.id === sess.planId && !sessions.some(s => s.id === p.recordedId) ? { ...p, recordedId: sess.id } : p);
  }
  return next;
}

// Training löschen; eine darauf verweisende Planung gilt danach wieder als offen
export function removeSession(data, id) {
  return {
    ...data,
    sessions: (data.sessions ?? []).filter(s => s.id !== id),
    plannedSessions: (data.plannedSessions ?? []).map(p => p.recordedId === id ? { ...p, recordedId: null } : p),
  };
}

// ─── Defaults für neue Planungen ───

// Team: zuletzt verwendetes Team (oder erstes). Halle, Art, Dauer, Uhrzeit: aus der letzten
// Einheit dieses Teams am gleichen Wochentag, sonst aus der letzten Einheit des Teams.
export function planDefaults(data, { date = "", teamId } = {}) {
  const teams = data.teams ?? [];
  const types = data.trainingTypes ?? [];
  const history = [...(data.sessions ?? []), ...(data.plannedSessions ?? [])]
    .filter(x => x.date)
    .sort((a, b) => b.date.localeCompare(a.date));
  const team = teamId ?? (history.find(x => teams.some(t => t.id === x.teamId))?.teamId ?? teams[0]?.id ?? "");
  const dow = date ? new Date(date + "T12:00:00").getDay() : null;
  const ofTeam = history.filter(x => x.teamId === team);
  const ref = (dow !== null && ofTeam.find(x => new Date(x.date + "T12:00:00").getDay() === dow)) || ofTeam[0];
  const type = types.find(t => t.id === ref?.trainingTypeId) ?? types[0];
  return {
    teamId: team,
    trainingTypeId: type?.id ?? "",
    durationMinutes: ref?.durationMinutes ?? type?.duration ?? 90,
    venueId: ref?.venueId ?? (data.venues ?? [])[0]?.id ?? null,
    time: ref?.time ?? "",
  };
}

// Alle bekannten Themen: verwendete zuerst (nach Häufigkeit), dann Vorschläge
export function knownTags(data) {
  const count = new Map();
  [...(data.sessions ?? []), ...(data.plannedSessions ?? [])].forEach(x =>
    content(x).tags.forEach(t => count.set(t, (count.get(t) ?? 0) + 1)));
  const used = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  return normalizeTags([...used, ...TAG_SUGGESTIONS]);
}

// ─── Suche ───

export function matchesQuery(x, q, data) {
  const query = (q ?? "").trim().toLocaleLowerCase("de");
  if (!query) return true;
  const c = content(x);
  const byId = (list, id) => (list ?? []).find(e => e.id === id);
  const hay = [
    byId(data.trainingTypes, x.trainingTypeId)?.name, byId(data.venues, x.venueId)?.name,
    byId(data.teams, x.teamId)?.name, c.focus, c.note, ...c.tags,
    ...c.checklist.flatMap(d => [d.text, d.note]),
  ];
  return hay.some(t => String(t ?? "").toLocaleLowerCase("de").includes(query));
}

// ─── Saisonübersicht ───

// Aggregiert erfasste Trainings. Minuten je Thema = Summe der Dauer der Einheiten mit diesem
// Thema; eine Einheit mit zwei Themen zählt bei beiden (wird in der UI ausgewiesen).
export function seasonOverview(sessions) {
  const list = sessions ?? [];
  const byTag = new Map();
  const byMonth = new Map();
  const focus = new Map();
  let untagged = 0, drillsPlanned = 0, drillsDone = 0, attSum = 0, attN = 0;

  list.forEach(s => {
    const c = content(s);
    const tags = normalizeTags(c.tags);
    if (!tags.length) untagged++;
    // Groß-/Kleinschreibung zählt nicht ("Wurf" = "wurf"), angezeigt wird die erste Schreibweise
    tags.forEach(t => {
      const key = t.toLocaleLowerCase("de");
      const e = byTag.get(key) ?? { tag: t, count: 0, minutes: 0 };
      e.count++; e.minutes += s.durationMinutes ?? 0;
      byTag.set(key, e);
    });
    const ym = s.date.slice(0, 7);
    const m = byMonth.get(ym) ?? { month: ym, count: 0, minutes: 0 };
    m.count++; m.minutes += s.durationMinutes ?? 0;
    byMonth.set(ym, m);
    const f = c.focus.trim();
    if (f) {
      const key = f.toLocaleLowerCase("de");
      const e = focus.get(key) ?? { text: f, count: 0 };
      e.count++; focus.set(key, e);
    }
    drillsPlanned += c.checklist.length;
    drillsDone += c.checklist.filter(d => d.done).length;
    const n = (s.attendance ?? []).length;
    if (n) { attSum += (s.attendance.filter(a => isPresent(a.status)).length / n); attN++; }
  });

  return {
    count: list.length,
    minutes: list.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0),
    tags: [...byTag.values()].sort((a, b) => b.count - a.count || b.minutes - a.minutes),
    untagged,
    months: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    focus: [...focus.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    drills: { planned: drillsPlanned, done: drillsDone },
    attendanceRate: attN ? Math.round(attSum / attN * 100) : null,
  };
}
