/// <reference path="../pb_data/types.d.ts" />
// TrainerHub Phase 4 – Team Workspace & Saisonbetrieb (siehe docs/PHASE4_TEAM_WORKSPACE.md).
//
//   seasons.goals     wenige freie Saisonziele [{ id, text, tags }] – bestehendes Saisonmodell erweitert
//   roster_entries    Saisonkader: Person (players) gehört in Saison X zu Team Y (Nummer, Position, Status)
//   observations      Trainerbeobachtung zu einer Person – gleichzeitig am Ereignis (Training/Planung/Spiel)
//   players           Sichtbarkeit: coach nur Personen seiner Teams (Saisonkader oder bisherige Teamliste),
//                     Abteilungsleitung/Vereins-Admin die ganze Abteilung. Profile bleiben unverändert.
//
// Löschverhalten (bewusst): Kader-/Beobachtungseinträge hängen an der Person (cascade – wer eine Person
// endgültig löscht, löscht ihre Daten mit). Training/Planung löschen entfernt nur den Verweis der
// Beobachtung (nicht Pflicht, kein cascade). Saison und Team sind Pflichtverweise ohne cascade: sie
// lassen sich nicht löschen, solange Kader/Beobachtungen daran hängen – Historie geht nie still verloren.
// Aus dem Kader entfernen = Status "left", kein Löschen.

const ME = "@request.auth.id";
const AUTHED = `${ME} != ""`;
const g = rule => (rule === null ? null : `${AUTHED} && (${rule})`);
const sectionMgmt = p => `(${p}.managers.id ?= ${ME} || ${p}.organization.admins.id ?= ${ME})`;
const teamAccess = p => { const x = p ? p + "." : ""; return `(${x}trainers.id ?= ${ME} || ${sectionMgmt(x + "section")})`; };
const sectionAccess = p => `(${sectionMgmt(p)} || (@collection.teams.section ?= ${p} && @collection.teams.trainers.id ?= ${ME}))`;
const unchanged = f => `(@request.body.${f}:isset = false || @request.body.${f} = ${f})`;

// Person sichtbar: Leitung/Admin der Abteilung, oder coach eines Teams, in dessen Saisonkader bzw.
// bisheriger Teamliste sie steht (je @collection-Bedingungspaar dieselbe Zeile)
const playerVisible = `(${sectionMgmt("section")} || ` +
  `(@collection.roster_entries.player ?= id && @collection.roster_entries.team.trainers.id ?= ${ME}) || ` +
  `(@collection.teams.players.id ?= id && @collection.teams.trainers.id ?= ${ME}))`;

const PLAYERS_OLD = {   // Stand 1760000200 (für den Rückweg)
  listRule: `${AUTHED} && (${sectionAccess("section")})`,
  viewRule: `${AUTHED} && (${sectionAccess("section")})`,
  updateRule: `${AUTHED} && (${sectionAccess("section")} && (@request.body.section:isset = false || @request.body.section = section))`,
};

const ID = { name: "id", type: "text", primaryKey: true, required: true, system: true,
  min: 1, max: 40, pattern: "^[a-z0-9]+$", autogeneratePattern: "[a-z0-9]{15}" };
const TIMESTAMPS = [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];
const text = (name, max = 200, extra = {}) => ({ name, type: "text", max, ...extra });
const json = (name, maxSize = 100000) => ({ name, type: "json", maxSize });
const rel = (name, collectionId, extra = {}) => ({ name, type: "relation", collectionId, maxSelect: 1, cascadeDelete: false, ...extra });
const EXTRA = json("extra", 200000);   // wie alle Sync-Collections: unbekannte Felder gehen nicht verloren

function collection(name, fields, rules, indexes) {
  const out = { type: "base", name, fields: [ID, ...fields, EXTRA, ...TIMESTAMPS], indexes };
  for (const [k, v] of Object.entries(rules)) out[k] = g(v);
  return new Collection(out);
}

// Aktive Saison eines Teams zum Stichtag (wie src/lib/workspace.js activeSeason)
function activeSeason(app, teamId, today) {
  const open = app.findRecordsByFilter("seasons", "team = {:t} && phase != 'abgeschlossen'", "-startDate", 0, 0, { t: teamId });
  return open.find(s => s.getString("startDate") <= today && today <= s.getString("endDate")) ?? open[0] ?? null;
}

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const teams = app.findCollectionByNameOrId("teams");
  const players = app.findCollectionByNameOrId("players");
  const seasons = app.findCollectionByNameOrId("seasons");
  const sessions = app.findCollectionByNameOrId("sessions");
  const plans = app.findCollectionByNameOrId("plans");

  seasons.fields.add(new JSONField({ name: "goals", maxSize: 100000 }));
  app.save(seasons);

  const roster = collection("roster_entries", [
    rel("season", seasons.id, { required: true }),
    rel("team", teams.id, { required: true }),
    rel("player", players.id, { required: true, cascadeDelete: true }),
    text("jerseyNumber", 10), text("position", 100), text("status", 20),
  ], {
    listRule: teamAccess("team"), viewRule: teamAccess("team"),
    createRule: `${teamAccess("team")} && season.team = team && player.section = team.section`,
    updateRule: `${teamAccess("team")} && ${unchanged("team")} && ${unchanged("season")} && ${unchanged("player")}`,
    deleteRule: teamAccess("team"),
  }, [
    "CREATE UNIQUE INDEX idx_roster_season_player ON roster_entries (season, player)",
    "CREATE INDEX idx_roster_team ON roster_entries (team)",
    "CREATE INDEX idx_roster_player ON roster_entries (player)",
  ]);
  app.save(roster);

  const observations = collection("observations", [
    rel("team", teams.id, { required: true }),
    rel("player", players.id, { required: true, cascadeDelete: true }),
    text("date", 10, { required: true }),
    rel("session", sessions.id), rel("plan", plans.id), text("gameRef", 100),
    text("text", 5000, { required: true }), json("tags", 20000),
    rel("createdBy", users.id), text("authorName", 200), text("capturedAt", 40),
  ], {
    listRule: teamAccess("team"), viewRule: teamAccess("team"),
    createRule: `${teamAccess("team")} && player.section = team.section && @request.body.createdBy = ${ME}`,
    updateRule: `${teamAccess("team")} && (createdBy = ${ME} || ${sectionMgmt("team.section")}) && ` +
      `${unchanged("team")} && ${unchanged("player")} && ${unchanged("createdBy")}`,
    deleteRule: `${teamAccess("team")} && (createdBy = ${ME} || ${sectionMgmt("team.section")})`,
  }, [
    "CREATE INDEX idx_observations_team_date ON observations (team, date)",
    "CREATE INDEX idx_observations_player ON observations (player)",
    "CREATE INDEX idx_observations_session ON observations (session)",
  ]);
  app.save(observations);

  // Spieler:innen: coach sieht/ändert nur Personen seiner Teams (Anlegen weiterhin in der Abteilung)
  players.listRule = g(playerVisible);
  players.viewRule = g(playerVisible);
  players.updateRule = g(`${playerVisible} && (@request.body.section:isset = false || @request.body.section = section)`);
  app.save(players);

  // Bestehende Daten: aktive Saison jedes Teams erhält einmalig den bisherigen Teamkader.
  // Historische Saisons bleiben ohne Kader (deren damalige Zusammensetzung ist unbekannt).
  const today = new Date().toISOString().slice(0, 10);
  for (const team of app.findAllRecords("teams")) {
    const season = activeSeason(app, team.id, today);
    if (!season) continue;
    if (app.findRecordsByFilter("roster_entries", "season = {:s}", "", 1, 0, { s: season.id }).length) continue;
    for (const pid of team.getStringSlice("players")) {
      const r = new Record(roster);
      r.set("season", season.id); r.set("team", team.id); r.set("player", pid); r.set("status", "active");
      app.save(r);
    }
  }
}, (app) => {
  // Rückweg: Kader und Beobachtungen entfallen (vorher Backup, siehe Doku); Teamlisten sind unverändert
  app.delete(app.findCollectionByNameOrId("observations"));
  app.delete(app.findCollectionByNameOrId("roster_entries"));
  const seasons = app.findCollectionByNameOrId("seasons");
  seasons.fields.removeByName("goals");
  app.save(seasons);
  const players = app.findCollectionByNameOrId("players");
  Object.assign(players, PLAYERS_OLD);
  app.save(players);
});
