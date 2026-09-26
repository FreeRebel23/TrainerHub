/// <reference path="../pb_data/types.d.ts" />
// TrainerHub – Datenmodell Phase 3 (siehe docs/PHASE3_SYNC_AND_SERVER.md).
//
// Mandanten: organizations → sections → teams. Die Organisation ist die oberste Grenze,
// das Team der zentrale Berechtigungsgegenstand. Zugriff wird ausschließlich hier über
// API-Regeln entschieden, nie im Frontend.
//
// IDs werden vom Client erzeugt (offline anlegbar), daher erlaubt das id-Feld 1–40 Zeichen
// [a-z0-9]. Datumsangaben sind lokale Kalendertage "YYYY-MM-DD" als Text – bewusst kein
// PocketBase-Datetime (UTC), damit kein Trainingstag verrutscht.

const ME = "@request.auth.id";

// WICHTIG: Jede Regel beginnt mit einer Anmeldeprüfung. In PocketBase trifft
// `leeresFeld.id ?= @request.auth.id` ohne Anmeldung zu (beide Seiten leer) – ohne diese
// Klammer wären z. B. Teams ohne Abteilungsleitung anonym lesbar (per Test abgesichert).
const AUTHED = `${ME} != ""`;
function guard(rules) {
  const out = {};
  Object.entries(rules).forEach(([k, v]) => { out[k] = v === null || v === undefined ? null : `${AUTHED} && (${v})`; });
  return out;
}

// Zugriff auf ein Team (p = Pfad zum Team-Datensatz, "" = der Datensatz selbst)
function teamAccess(p) {
  const x = p ? p + "." : "";
  return `(${x}trainers.id ?= ${ME} || ${x}section.managers.id ?= ${ME} || ${x}section.organization.admins.id ?= ${ME})`;
}
// Zugriff auf eine Abteilung: Leitung, Vereins-Admin oder Trainer:in eines Teams darin.
// Die beiden @collection.teams-Bedingungen beziehen sich auf dieselbe Zeile (gleicher Join).
function sectionAccess(p) {
  return `(${p}.managers.id ?= ${ME} || ${p}.organization.admins.id ?= ${ME} || ` +
    `(@collection.teams.section ?= ${p} && @collection.teams.trainers.id ?= ${ME}))`;
}
function orgMember(p) {
  return `(${p}.members.id ?= ${ME} || ${p}.admins.id ?= ${ME})`;
}
function orgAdmin(p) { return `${p}.admins.id ?= ${ME}`; }

// Datensatz darf nicht in ein Team verschoben werden, auf das kein Zugriff besteht
const TEAM_MOVE = `(@request.body.team:isset = false || @request.body.team = team || ${teamAccess("@request.body.team")})`;

const ID = { name: "id", type: "text", primaryKey: true, required: true, system: true,
  min: 1, max: 40, pattern: "^[a-z0-9]+$", autogeneratePattern: "[a-z0-9]{15}" };
const TIMESTAMPS = [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];
const text = (name, extra = {}) => ({ name, type: "text", max: 20000, ...extra });
const num = name => ({ name, type: "number" });
const json = (name, maxSize = 2000000) => ({ name, type: "json", maxSize });
const rel = (name, collectionId, extra = {}) => ({ name, type: "relation", collectionId, maxSelect: 1, cascadeDelete: false, ...extra });
const many = (name, collectionId) => ({ name, type: "relation", collectionId, maxSelect: 9999, cascadeDelete: false });
// Unbekannte Felder älterer/neuerer App-Versionen gehen nicht verloren
const EXTRA = json("extra", 200000);

function base(name, fields, rules, indexes = []) {
  return new Collection({ type: "base", name, fields: [ID, ...fields, EXTRA, ...TIMESTAMPS], indexes, ...guard(rules) });
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");

  // Anlegen/Ändern von Vereinen und Abteilungen nur als Superuser (Dashboard bzw. Skript)
  const organizations = base("organizations", [text("name", { required: true, max: 200 }),
    many("admins", users.id), many("members", users.id)], {
    listRule: `(members.id ?= ${ME} || admins.id ?= ${ME})`, viewRule: `(members.id ?= ${ME} || admins.id ?= ${ME})`,
    createRule: null, updateRule: null, deleteRule: null,
  });
  app.save(organizations);

  const sections = base("sections", [rel("organization", organizations.id, { required: true }),
    text("name", { required: true, max: 200 }), text("sport", { max: 100 }), many("managers", users.id)], {
    listRule: orgMember("organization"), viewRule: orgMember("organization"),
    createRule: null, updateRule: null, deleteRule: null,
  });
  app.save(sections);

  // Regeln für players folgen unten – sie verweisen auf teams, das es hier noch nicht gibt
  const players = base("players", [rel("section", sections.id, { required: true }),
    text("name", { required: true, max: 200 }), num("birthYear"), { name: "injured", type: "bool" }], {});
  app.save(players);

  const teams = base("teams", [rel("section", sections.id, { required: true }),
    text("name", { required: true, max: 200 }), many("trainers", users.id), many("players", players.id)], {
    listRule: teamAccess(""), viewRule: teamAccess(""),
    // Neues Team: nur in einer zugänglichen Abteilung und nur mit sich selbst als Trainer:in
    createRule: sectionAccess("section") + ` && @request.body.trainers:length = 1 && @request.body.trainers.id ?= ${ME}`,
    // Trainer:innen-Zuordnung ändern nur Vereins-Admins bzw. Abteilungsleitung
    updateRule: teamAccess("") + ` && (@request.body.section:isset = false || @request.body.section = section)` +
      ` && (@request.body.trainers:isset = false || section.managers.id ?= ${ME} || section.organization.admins.id ?= ${ME})`,
    deleteRule: orgAdmin("section.organization"),
  });
  app.save(teams);

  Object.assign(players, guard({
    listRule: sectionAccess("section"), viewRule: sectionAccess("section"),
    createRule: sectionAccess("section"),
    updateRule: sectionAccess("section") + ` && (@request.body.section:isset = false || @request.body.section = section)`,
    deleteRule: orgAdmin("section.organization"),
  }));
  app.save(players);

  const venues = base("venues", [rel("organization", organizations.id, { required: true }),
    text("name", { required: true, max: 200 }), text("address", { max: 500 })], {
    listRule: orgMember("organization"), viewRule: orgMember("organization"), createRule: orgMember("organization"),
    updateRule: orgMember("organization") + ` && (@request.body.organization:isset = false || @request.body.organization = organization)`,
    deleteRule: orgAdmin("organization"),
  });
  app.save(venues);

  const trainingTypes = base("training_types", [rel("section", sections.id, { required: true }),
    text("name", { required: true, max: 200 }), num("duration")], {
    listRule: sectionAccess("section"), viewRule: sectionAccess("section"), createRule: sectionAccess("section"),
    updateRule: sectionAccess("section") + ` && (@request.body.section:isset = false || @request.body.section = section)`,
    deleteRule: `(section.managers.id ?= ${ME} || ${orgAdmin("section.organization")})`,
  });
  app.save(trainingTypes);

  const teamRules = {
    listRule: teamAccess("team"), viewRule: teamAccess("team"), createRule: teamAccess("team"),
    updateRule: teamAccess("team") + " && " + TEAM_MOVE, deleteRule: teamAccess("team"),
  };

  const seasons = base("seasons", [rel("team", teams.id, { required: true }), text("name", { max: 200 }),
    text("startDate", { max: 10 }), text("endDate", { max: 10 }), text("phase", { max: 50 }), json("gamedays")],
    teamRules, ["CREATE INDEX idx_seasons_team ON seasons (team)"]);
  app.save(seasons);

  const content = [text("time", { max: 5 }), rel("trainingType", trainingTypes.id), rel("venue", venues.id),
    num("durationMinutes"), text("focus", { max: 2000 }), json("tags", 100000), json("checklist"), text("note")];

  // Planung = was war vorgesehen. Die Verknüpfung zum durchgeführten Training liegt nur am
  // Training (sessions.plan) – keine zirkuläre Relation; recordedId wird im Client abgeleitet.
  const plans = base("plans", [rel("team", teams.id, { required: true }), text("date", { required: true, max: 10 }), ...content],
    teamRules, ["CREATE INDEX idx_plans_team_date ON plans (team, date)"]);
  app.save(plans);

  // Training = was ist tatsächlich passiert
  const sessions = base("sessions", [rel("team", teams.id, { required: true }), rel("plan", plans.id),
    text("date", { required: true, max: 10 }), ...content, num("factor"), json("attendance"), text("recordedBy", { max: 200 })],
    teamRules, ["CREATE INDEX idx_sessions_team_date ON sessions (team, date)", "CREATE INDEX idx_sessions_plan ON sessions (plan)"]);
  app.save(sessions);
}, (app) => {
  for (const name of ["sessions", "plans", "seasons", "training_types", "venues", "teams", "players", "sections", "organizations"]) {
    const c = app.findCollectionByNameOrId(name);
    app.delete(c);
  }
});
