// Übernahme eines bestehenden Gerätestands (Phase 1/2) in den Server-Account.
// Reine Funktionen, jede Umformung ist getestet. Der eigentliche Upload läuft danach über
// den normalen Sync (engine.js): Datensätze, die es auf dem Server schon gibt, werden nie
// überschrieben, sondern übernommen – so entstehen keine Duplikate.

import { INIT } from "../lib/constants.js";

// Server-IDs: 10–40 Zeichen [a-z0-9]. Phase-1/2-IDs (Zeitstempel + Zufall) erfüllen das fast
// immer; Start-IDs wie "t0", "p1", "tt1" nicht – und wären zwischen Vereinen nicht eindeutig.
export const VALID_ID = /^[a-z0-9]{10,40}$/;

// Deterministischer Hash (cyrb53) → gleiche Ausgangsdaten eines Benutzers ergeben auf jedem
// Gerät dieselben neuen IDs; ein zweites Gerät mit derselben Herkunft erzeugt keine Duplikate.
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
export function stableId(...parts) {
  const s = parts.join("\u0000");
  return ("m" + cyrb53(s, 1).toString(36) + cyrb53(s, 2).toString(36)).slice(0, 24);
}

const LISTS = ["players", "teams", "trainingTypes", "venues", "seasons", "plannedSessions", "sessions"];
const clone = v => JSON.parse(JSON.stringify(v));

// Ersetzt ungültige IDs überall – inkl. aller Verweise. salt = Benutzer-ID.
export function migrateIds(data, salt) {
  const d = clone(data);
  const maps = {};
  LISTS.forEach(list => {
    maps[list] = new Map();
    (d[list] ?? []).forEach(x => {
      const id = String(x.id ?? "");
      if (!VALID_ID.test(id)) maps[list].set(id, stableId(salt, list, id));
    });
  });
  const m = (list, id) => (id !== undefined && id !== null && id !== "" && maps[list].get(String(id))) || id;
  LISTS.forEach(list => (d[list] ?? []).forEach(x => { x.id = m(list, x.id); }));
  (d.teams ?? []).forEach(t => { t.playerIds = (t.playerIds ?? []).map(id => m("players", id)); });
  (d.seasons ?? []).forEach(s => { s.teamId = m("teams", s.teamId); });
  ["plannedSessions", "sessions"].forEach(list => (d[list] ?? []).forEach(x => {
    x.teamId = m("teams", x.teamId);
    if ("trainingTypeId" in x) x.trainingTypeId = m("trainingTypes", x.trainingTypeId);
    if ("venueId" in x) x.venueId = m("venues", x.venueId);
  }));
  (d.sessions ?? []).forEach(s => {
    s.attendance = (s.attendance ?? []).map(a => ({ ...a, playerId: m("players", a.playerId) }));
    if (s.planId) s.planId = m("plannedSessions", s.planId);
  });
  (d.plannedSessions ?? []).forEach(p => { if (p.recordedId) p.recordedId = m("sessions", p.recordedId); });
  const changed = LISTS.reduce((n, l) => n + maps[l].size, 0);
  return { data: d, changed };
}

// Phase 1 speicherte die Verknüpfung nur an der Planung (recordedId). Auf dem Server gibt es
// nur sessions.plan → fehlende planId am Training aus der Planung ergänzen.
export function linkPlans(data) {
  const d = clone(data);
  const byId = new Map((d.sessions ?? []).map(s => [s.id, s]));
  (d.plannedSessions ?? []).forEach(p => {
    const s = p.recordedId && byId.get(p.recordedId);
    if (s && !s.planId) s.planId = p.id;
  });
  return d;
}

// Frischer Start ohne eigene Eingaben (nur die Beispieldaten aus INIT)
export function isPristineInit(data) {
  if (!data) return true;
  if ((data.sessions ?? []).length || (data.plannedSessions ?? []).length || (data.seasons ?? []).length) return false;
  const ids = l => (l ?? []).map(x => `${x.id}:${x.name}`).sort().join("|");
  return ids(data.players) === ids(INIT.players) && ids(data.teams) === ids(INIT.teams);
}

export function hasLocalContent(data) {
  return !isPristineInit(data) && ((data.teams ?? []).length > 0 || (data.sessions ?? []).length > 0 || (data.plannedSessions ?? []).length > 0);
}

export function summarize(data) {
  return {
    teams: (data?.teams ?? []).length,
    players: (data?.players ?? []).length,
    sessions: (data?.sessions ?? []).length,
    plans: (data?.plannedSessions ?? []).length,
    seasons: (data?.seasons ?? []).length,
    trainingTypes: (data?.trainingTypes ?? []).length,
    venues: (data?.venues ?? []).length,
  };
}

const key = s => String(s ?? "").trim().toLocaleLowerCase("de");

// Zusammenführen mit vorhandenen Serverdaten: gleichnamige Stammdaten (Team, Trainingsart, Halle,
// Spieler:in mit gleichem Jahrgang) werden als dieselben erkannt und auf die Server-ID umgestellt.
// Trainings, Planungen und Saisons werden über ihre ID abgeglichen – nie über Inhalte.
export function matchToServer(data, server) {
  const d = clone(data);
  const plan = [
    ["teams", t => key(t.name)],
    ["trainingTypes", t => key(t.name)],
    ["venues", v => key(v.name)],
    ["players", p => `${key(p.name)}|${p.birthYear ?? ""}`],
  ];
  const maps = {};
  const matched = {};
  plan.forEach(([list, k]) => {
    const srv = new Map();
    (server?.[list] ?? []).forEach(x => { if (!srv.has(k(x))) srv.set(k(x), x.id); });
    maps[list] = new Map();
    (d[list] ?? []).forEach(x => {
      const sid = srv.get(k(x));
      if (sid && sid !== x.id) maps[list].set(x.id, sid);
    });
    matched[list] = maps[list].size;
  });
  const m = (list, id) => maps[list].get(id) ?? id;
  plan.forEach(([list]) => {
    const seen = new Set();
    d[list] = (d[list] ?? []).map(x => ({ ...x, id: m(list, x.id) }))
      .filter(x => (seen.has(x.id) ? false : (seen.add(x.id), true)));
  });
  (d.teams ?? []).forEach(t => { t.playerIds = [...new Set((t.playerIds ?? []).map(id => m("players", id)))]; });
  (d.seasons ?? []).forEach(s => { s.teamId = m("teams", s.teamId); });
  ["plannedSessions", "sessions"].forEach(list => (d[list] ?? []).forEach(x => {
    x.teamId = m("teams", x.teamId);
    if (x.trainingTypeId) x.trainingTypeId = m("trainingTypes", x.trainingTypeId);
    if (x.venueId) x.venueId = m("venues", x.venueId);
  }));
  (d.sessions ?? []).forEach(s => { s.attendance = (s.attendance ?? []).map(a => ({ ...a, playerId: m("players", a.playerId) })); });
  return { data: d, matched };
}

// Vollständige Vorbereitung für den ersten Upload
export function prepareUpload(data, { userId, server = null }) {
  let d = linkPlans(data);
  d = migrateIds(d, userId).data;
  const matched = server ? matchToServer(d, server) : { data: d, matched: {} };
  return matched;
}

export const EMPTY_DATA = () => ({
  players: [], teams: [], trainingTypes: [], venues: [], sessions: [], plannedSessions: [], seasons: [],
  settings: { trainerName: "" },
});
