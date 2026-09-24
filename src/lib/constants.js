// Fachliche Konstanten. Schlüssel und Faktoren sind Teil des gespeicherten
// Datenformats (localStorage, Backups, Sync-Dateien) — nicht umbenennen.

export const STORE_KEY = "trainerhub_v1";

// icon/short werden nur noch in Druckansichten verwendet; die App-Oberfläche
// arbeitet mit `tone` (Design-Token) und `label`.
export const STATUSES = {
  present:         { label: "Dabei",                  short: "Dabei",     icon: "✅",   factorMult: 1.0, tone: "success" },
  injured_present: { label: "Verletzt – trotzdem da", short: "Verl. da",  icon: "🤕❤️", factorMult: 0.5, tone: "warning" },
  injured_absent:  { label: "Verletzt – nicht da",    short: "Verletzt",  icon: "🤕",   factorMult: 0.0, tone: "muted"   },
  excused:         { label: "Entschuldigt",           short: "Entsch.",   icon: "📝",   factorMult: 0.0, tone: "info"    },
  absent:          { label: "Fehlt",                  short: "Fehlt",     icon: "❌",   factorMult: 0.0, tone: "danger"  },
};
export const STATUS_KEYS = Object.keys(STATUSES);
export const PRESENT_STATUSES = ["present", "injured_present"];

export const PHASES = {
  vorbereitung:  { label: "Vorbereitung",    tone: "warning" },
  saison:        { label: "Reguläre Saison", tone: "success" },
  offseason:     { label: "Offseason",       tone: "muted"   },
  abgeschlossen: { label: "Abgeschlossen",   tone: "info"    },
};

export const DURATIONS = [45, 60, 75, 90, 105, 120, 150];
export const TYPE_DURATIONS = [30, 45, 60, 75, 90, 105, 120, 150];

export const INIT = {
  players: [
    { id: "p1", name: "Anna Müller",  birthYear: 2009, injured: false },
    { id: "p2", name: "Sarah Klein",  birthYear: 2010, injured: false },
    { id: "p3", name: "Lena Berg",    birthYear: 2009, injured: true  },
    { id: "p4", name: "Julia Koch",   birthYear: 2010, injured: false },
    { id: "p5", name: "Marie Hahn",   birthYear: 2009, injured: false },
  ],
  teams: [{
    id: "t0", name: "U16w",
    playerIds: ["p1","p2","p3","p4","p5"],
  }],
  trainingTypes: [
    { id: "tt1", name: "Basketball", duration: 90, emoji: "🏀" },
    { id: "tt2", name: "Fitness",    duration: 60, emoji: "💪" },
    { id: "tt3", name: "Taktik",     duration: 90, emoji: "🧠" },
    { id: "tt4", name: "Technik",    duration: 75, emoji: "🎯" },
  ],
  venues: [
    { id: "v1", name: "HSB Hallensportzentrum", address: "Sportzentrum 4",  emoji: "🏟️" },
    { id: "v2", name: "TV-Halle",               address: "Withumanlage 7", emoji: "🏠" },
    { id: "v3", name: "Jahnhalle",              address: "Postweg",        emoji: "🏛️" },
    { id: "v4", name: "TV-Platz (Außen)",       address: "Außenanlage",    emoji: "🌤️" },
  ],
  sessions: [],
  plannedSessions: [],
  seasons: [],
  settings: { trainerName: "" },
};
