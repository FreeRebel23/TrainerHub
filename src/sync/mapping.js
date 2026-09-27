// Abbildung lokaler Datenstand (wie seit Phase 1/2 in localStorage) ↔ PocketBase-Datensätze.
// Reine Funktionen. Der Sync vergleicht ausschließlich in der kanonischen Server-Form, damit
// "leer" überall gleich aussieht ("" / 0 / null) und keine Scheinänderungen entstehen.
//
// Lokale Felder, die das Schema nicht kennt, landen im JSON-Feld `extra` und kommen beim
// Herunterladen unverändert zurück – ältere oder neuere App-Versionen verlieren nichts.

// type: text | num | numOrNull | bool | json | rel | rels
// local: Feldname im lokalen Objekt, server: Feldname in PocketBase
// scope: Pflicht-Zuordnung zu Verein/Abteilung, die bei neuen Einträgen aus dem Kontext kommt
// readOnly: nur herunterladen (serverseitig befüllt, z. B. Spiele aus dem Sports-Data-Adapter);
//           lokale Änderungen werden nie übertragen, der Serverstand gilt immer
export const COLLECTIONS = [
  { name: "venues", local: "venues", scope: { local: "organizationId", server: "organization", ctx: "organizationId" },
    fields: [["name", "name", "text"], ["address", "address", "text"]] },
  { name: "training_types", local: "trainingTypes", scope: { local: "sectionId", server: "section", ctx: "sectionId" },
    fields: [["name", "name", "text"], ["duration", "duration", "num"]] },
  { name: "players", local: "players", scope: { local: "sectionId", server: "section", ctx: "sectionId" },
    fields: [["name", "name", "text"], ["birthYear", "birthYear", "numOrNull"], ["injured", "injured", "bool"]] },
  { name: "teams", local: "teams", scope: { local: "sectionId", server: "section", ctx: "sectionId" },
    fields: [["name", "name", "text"], ["playerIds", "players", "rels", "players"]] },
  { name: "seasons", local: "seasons",
    fields: [["teamId", "team", "rel", "teams"], ["name", "name", "text"], ["startDate", "startDate", "text"],
      ["endDate", "endDate", "text"], ["phase", "phase", "text"], ["gamedays", "gamedays", "json"], ["goals", "goals", "json"]] },
  { name: "plans", local: "plannedSessions", derived: ["recordedId"],
    fields: [["teamId", "team", "rel", "teams"], ["date", "date", "text"], ["time", "time", "text"],
      ["trainingTypeId", "trainingType", "rel", "training_types"], ["venueId", "venue", "rel", "venues"],
      ["durationMinutes", "durationMinutes", "num"], ["focus", "focus", "text"], ["tags", "tags", "json"],
      ["checklist", "checklist", "json"], ["note", "note", "text"]] },
  { name: "sessions", local: "sessions",
    fields: [["teamId", "team", "rel", "teams"], ["planId", "plan", "rel", "plans"], ["date", "date", "text"],
      ["time", "time", "text"], ["trainingTypeId", "trainingType", "rel", "training_types"], ["venueId", "venue", "rel", "venues"],
      ["durationMinutes", "durationMinutes", "num"], ["factor", "factor", "num"], ["attendance", "attendance", "json"],
      ["checklist", "checklist", "json"], ["focus", "focus", "text"], ["tags", "tags", "json"], ["note", "note", "text"],
      ["erfasstVon", "recordedBy", "text"]] },
  // Phase 4: Saisonkader (Person ↔ Team ↔ Saison) und Trainerbeobachtungen
  { name: "roster_entries", local: "rosterEntries",
    fields: [["seasonId", "season", "rel", "seasons"], ["teamId", "team", "rel", "teams"], ["playerId", "player", "rel", "players"],
      ["jerseyNumber", "jerseyNumber", "text"], ["position", "position", "text"], ["status", "status", "text"]] },
  { name: "observations", local: "observations",
    fields: [["teamId", "team", "rel", "teams"], ["playerId", "player", "rel", "players"], ["date", "date", "text"],
      ["sessionId", "session", "rel", "sessions"], ["planId", "plan", "rel", "plans"], ["gameRef", "gameRef", "text"],
      ["text", "text", "text"], ["tags", "tags", "json"], ["createdBy", "createdBy", "text"], ["authorName", "authorName", "text"],
      ["capturedAt", "capturedAt", "text"]] },
  // Spiele aus dem Sports-Data-Adapter (optional; ohne Integration einfach leer). TrainerHub liest nur
  // die bereits normalisierten Datensätze seines Stores – keine Provider-Logik im Client.
  { name: "competitions", local: "competitions", readOnly: true,
    fields: [["name", "name", "text"], ["seasonName", "seasonName", "text"]] },
  { name: "games", local: "externalGames", readOnly: true,
    fields: [["competitionId", "competition", "rel", "competitions"], ["homeTeamId", "homeTeam", "rel", "teams"],
      ["awayTeamId", "awayTeam", "rel", "teams"], ["date", "date", "text"], ["time", "time", "text"],
      ["previousDate", "previousDate", "text"], ["homeTeamName", "homeTeamName", "text"], ["awayTeamName", "awayTeamName", "text"],
      ["homeScore", "homeScore", "num"], ["awayScore", "awayScore", "num"], ["status", "status", "text"],
      ["forfeit", "forfeit", "bool"], ["periods", "periods", "json"], ["venue", "venue", "text"],
      ["missingCount", "missingCount", "num"], ["provider", "provider", "text"]] },
];

export const BY_NAME = Object.fromEntries(COLLECTIONS.map(c => [c.name, c]));
// Reihenfolge beim Anlegen/Ändern (Abhängigkeiten zuerst); Löschen umgekehrt
export const PUSH_ORDER = COLLECTIONS.map(c => c.name);
export const isReadOnly = name => !!BY_NAME[name]?.readOnly;

function toServerValue(type, v) {
  switch (type) {
    case "text": return v === undefined || v === null ? "" : String(v);
    case "num":
    case "numOrNull": { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? 0 : n; }
    case "bool": return !!v;
    case "json": return v === undefined ? null : v;
    case "rel": return v === undefined || v === null ? "" : String(v);
    case "rels": return Array.isArray(v) ? v.filter(Boolean).map(String) : [];
    default: return v;
  }
}

// Kanonischer Server-Feldsatz eines lokalen Objekts (ohne id/created/updated)
export function localToFields(coll, obj, ctx = {}) {
  const spec = BY_NAME[coll];
  const known = new Set(["id", ...(spec.derived ?? [])]);
  const out = {};
  spec.fields.forEach(([l, s, type]) => { known.add(l); out[s] = toServerValue(type, obj[l]); });
  if (spec.scope) {
    known.add(spec.scope.local);
    out[spec.scope.server] = String(obj[spec.scope.local] ?? ctx[spec.scope.ctx] ?? "");
  }
  const extra = {};
  Object.keys(obj).forEach(k => { if (!known.has(k) && obj[k] !== undefined) extra[k] = obj[k]; });
  out.extra = Object.keys(extra).length ? extra : null;
  return out;
}

// Kanonischer Feldsatz aus einem PocketBase-Datensatz (nur Schemafelder)
export function recordToFields(coll, rec) {
  const spec = BY_NAME[coll];
  const out = {};
  spec.fields.forEach(([, s, type]) => { out[s] = toServerValue(type, rec[s]); });
  if (spec.scope) out[spec.scope.server] = String(rec[spec.scope.server] ?? "");
  out.extra = rec.extra && typeof rec.extra === "object" && Object.keys(rec.extra).length ? rec.extra : null;
  return out;
}

// Lokales Objekt aus kanonischen Feldern. Leere optionale Werte werden weggelassen –
// die App behandelt fehlende Felder seit Phase 2 mit Defaults (training.js/content()).
export function fieldsToLocal(coll, id, f) {
  const spec = BY_NAME[coll];
  const obj = { id, ...(f.extra ?? {}) };
  spec.fields.forEach(([l, s, type]) => {
    const v = f[s];
    if (type === "text") { if (v !== "" || ["name", "date"].includes(l)) obj[l] = v ?? ""; }
    else if (type === "numOrNull") obj[l] = v ? v : null;
    else if (type === "json") { if (v !== null && v !== undefined) obj[l] = v; }
    else if (type === "rel") {
      if (l === "venueId") obj[l] = v || null;
      else if (l === "planId") { if (v) obj[l] = v; }
      else obj[l] = v ?? "";
    }
    else obj[l] = v;
  });
  if (spec.scope && f[spec.scope.server]) obj[spec.scope.local] = f[spec.scope.server];
  return obj;
}

// Gesamter lokaler Datenstand → { collection: Map(id → Felder) }
export function toServerSets(data, ctx = {}) {
  const sets = {};
  COLLECTIONS.forEach(spec => {
    const m = new Map();
    (data?.[spec.local] ?? []).forEach(obj => { if (obj?.id) m.set(String(obj.id), localToFields(spec.name, obj, ctx)); });
    sets[spec.name] = m;
  });
  return sets;
}

// { collection: Map(id → Felder) } → lokale Sammlungen. plan.recordedId wird aus den Trainings
// abgeleitet (einzige gespeicherte Verknüpfung ist sessions.plan).
export function fromServerSets(sets, created = {}) {
  const out = {};
  COLLECTIONS.forEach(spec => {
    out[spec.local] = [...(sets[spec.name] ?? new Map()).entries()].map(([id, f]) => fieldsToLocal(spec.name, id, f));
  });
  const recorded = new Map();
  [...(sets.sessions ?? new Map()).entries()]
    .filter(([, f]) => f.plan)
    .sort((a, b) => (created[a[0]] ?? "").localeCompare(created[b[0]] ?? "") || a[0].localeCompare(b[0]))
    .forEach(([id, f]) => { if (!recorded.has(f.plan)) recorded.set(f.plan, id); });
  out.plannedSessions.forEach(p => { p.recordedId = recorded.get(p.id) ?? null; });
  return out;
}

// Deterministische Serialisierung für Vergleiche (Schlüsselreihenfolge egal)
export function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).filter(k => v[k] !== undefined).sort()
    .map(k => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v ?? null);
}
export const same = (a, b) => stable(a) === stable(b);
