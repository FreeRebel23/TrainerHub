/// <reference path="../pb_data/types.d.ts" />
// TrainerHub – Spielbetrieb & Verbandsdaten (siehe docs/SPORTS_DATA_ARCHITECTURE.md).
//
// Externe Verbandsdaten werden serverseitig vom Sync-Job (server/sports, Superuser) geschrieben.
// Für Benutzer:innen sind alle Provider-Daten nur lesbar – Ausnahme: die manuelle Bestätigung
// einer Spieler-Zuordnung (player_links). Berechtigungsprofile und bestehende Collections bleiben
// unverändert; die Regeln verwenden dieselben Bausteine wie 1760000200.
//
//   team_links                 Team ↔ Provider-Mannschaft (einmalig, saisonübergreifend)
//   competitions               Wettbewerb/Liga einer Saison (je Abteilung, provider+externalId)
//   team_competitions          Team nimmt an Wettbewerb teil (saisonabhängig)
//   games                      Spiel inkl. Ergebnis und Abschnitten (generisch)
//   standings                  offizielle Tabelle eines Wettbewerbs (aktueller Stand)
//   basketball_player_game_stats  Basketball-Spielerwerte je Spiel (nur eigene Teams)
//   player_links               Spieler:in ↔ Provider-Person (nur manuell bestätigt)
//   sync_runs                  Protokoll der Sync-Läufe

const ME = "@request.auth.id";
const AUTHED = `${ME} != ""`;
const g = rule => (rule === null ? null : `${AUTHED} && (${rule})`);
const sectionMgmt = p => `(${p}.managers.id ?= ${ME} || ${p}.organization.admins.id ?= ${ME})`;
const teamAccess = p => { const x = p ? p + "." : ""; return `(${x}trainers.id ?= ${ME} || ${sectionMgmt(x + "section")})`; };
const sectionAccess = p => `(${sectionMgmt(p)} || (@collection.teams.section ?= ${p} && @collection.teams.trainers.id ?= ${ME}))`;

const ID = { name: "id", type: "text", primaryKey: true, required: true, system: true,
  min: 1, max: 40, pattern: "^[a-z0-9]+$", autogeneratePattern: "[a-z0-9]{15}" };
const TIMESTAMPS = [
  { name: "created", type: "autodate", onCreate: true, onUpdate: false },
  { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
];
const text = (name, max = 200, extra = {}) => ({ name, type: "text", max, ...extra });
const req = (name, max = 200) => text(name, max, { required: true });
const num = name => ({ name, type: "number" });
const bool = name => ({ name, type: "bool" });
const json = (name, maxSize = 500000) => ({ name, type: "json", maxSize });
const rel = (name, collectionId, extra = {}) => ({ name, type: "relation", collectionId, maxSelect: 1, cascadeDelete: false, ...extra });
// Herkunft: welcher Provider, wann zuletzt synchronisiert / gesehen, Stand laut Quelle (falls geliefert)
const PROVENANCE = [text("sourceUpdatedAt", 40), text("lastSyncedAt", 40), text("lastSeenAt", 40)];

function collection(name, fields, rules, indexes) {
  const out = { type: "base", name, fields: [ID, ...fields, ...TIMESTAMPS], indexes };
  for (const [k, v] of Object.entries(rules)) out[k] = g(v);
  return new Collection(out);
}
const READ_ONLY = { createRule: null, updateRule: null, deleteRule: null };

migrate((app) => {
  const sections = app.findCollectionByNameOrId("sections");
  const teams = app.findCollectionByNameOrId("teams");
  const players = app.findCollectionByNameOrId("players");
  const seasons = app.findCollectionByNameOrId("seasons");
  const users = app.findCollectionByNameOrId("users");
  const section = rel("section", sections.id, { required: true });

  // Team ↔ Provider-Mannschaft. Wird einmal zugeordnet; alles Weitere läuft über externe IDs.
  // publish = Spiele/Tabelle dieses Teams dürfen im öffentlichen Feed (GameDay/Scoreboard) erscheinen.
  const teamLinks = collection("team_links", [section, rel("team", teams.id, { required: true, cascadeDelete: true }),
    req("provider", 50), req("externalTeamId", 50), text("externalClubId", 50), text("externalName"), bool("publish")],
  { listRule: teamAccess("team"), viewRule: teamAccess("team"), ...READ_ONLY }, [
    "CREATE UNIQUE INDEX idx_team_links_team ON team_links (team, provider)",
    "CREATE UNIQUE INDEX idx_team_links_ext ON team_links (section, provider, externalTeamId)",
  ]);
  app.save(teamLinks);

  const competitions = collection("competitions", [section, req("provider", 50), req("externalId", 50),
    req("name"), text("season", 20), text("seasonName", 40), text("level", 100), text("ageGroup", 100),
    text("gender", 50), text("association", 100), text("district", 100), bool("hasStandings"), ...PROVENANCE],
  { listRule: sectionAccess("section"), viewRule: sectionAccess("section"), ...READ_ONLY }, [
    "CREATE UNIQUE INDEX idx_competitions_ext ON competitions (section, provider, externalId)",
  ]);
  app.save(competitions);

  // Teilnahme eines Teams an einem Wettbewerb (= saisonabhängige Zuordnung). externalTeamId ist die
  // Provider-ID der Mannschaft in genau diesem Wettbewerb; season optional die TrainerHub-Saison.
  const teamCompetitions = collection("team_competitions", [section,
    rel("team", teams.id, { required: true, cascadeDelete: true }),
    rel("competition", competitions.id, { required: true, cascadeDelete: true }),
    rel("season", seasons.id), req("provider", 50), text("externalTeamId", 50), bool("active"), ...PROVENANCE],
  { listRule: teamAccess("team"), viewRule: teamAccess("team"), ...READ_ONLY }, [
    "CREATE UNIQUE INDEX idx_team_competitions ON team_competitions (team, competition)",
  ]);
  app.save(teamCompetitions);

  // Generisches Spiel. homeTeam/awayTeam = interne Teams, falls die Seite ein eigenes Team ist
  // (bei vereinsinternen Duellen beide). periods = Abschnitte [{label, home, away}] inkl. Verlängerungen.
  const games = collection("games", [section, rel("competition", competitions.id, { required: true, cascadeDelete: true }),
    rel("homeTeam", teams.id), rel("awayTeam", teams.id), req("provider", 50), req("externalId", 50),
    text("matchNo", 50), num("matchDay"), req("date", 10), text("time", 5), text("previousDate", 10),
    text("homeTeamName"), text("awayTeamName"), text("homeTeamExternalId", 50), text("awayTeamExternalId", 50),
    num("homeScore"), num("awayScore"), req("status", 20), bool("forfeit"), bool("resultConfirmed"),
    json("periods", 20000), text("venue"), text("venueExternalId", 50), text("venueAddress", 300),
    num("missingCount"), text("detailsSyncedAt", 40), text("statsCheckedAt", 40), ...PROVENANCE],
  {
    listRule: `(homeTeam.trainers.id ?= ${ME} || awayTeam.trainers.id ?= ${ME} || ${sectionMgmt("section")})`,
    viewRule: `(homeTeam.trainers.id ?= ${ME} || awayTeam.trainers.id ?= ${ME} || ${sectionMgmt("section")})`,
    ...READ_ONLY,
  }, [
    "CREATE UNIQUE INDEX idx_games_ext ON games (section, provider, externalId)",
    "CREATE INDEX idx_games_section_date ON games (section, date)",
    "CREATE INDEX idx_games_competition ON games (competition)",
  ]);
  app.save(games);

  // Offizielle Tabelle – aktueller Stand, nicht selbst berechnet
  const standings = collection("standings", [section,
    rel("competition", competitions.id, { required: true, cascadeDelete: true }), req("provider", 50),
    json("entries", 200000), text("fetchedAt", 40), text("sourceUpdatedAt", 40)],
  { listRule: sectionAccess("section"), viewRule: sectionAccess("section"), ...READ_ONLY }, [
    "CREATE UNIQUE INDEX idx_standings_competition ON standings (competition)",
  ]);
  app.save(standings);

  // Basketball-spezifisch, getrennt von players: nur Werte, die die Quelle liefert, nur eigene Teams.
  // player bleibt leer, bis eine bestätigte Zuordnung (player_links) existiert.
  const stats = collection("basketball_player_game_stats", [section,
    rel("game", games.id, { required: true, cascadeDelete: true }), rel("team", teams.id, { required: true }),
    rel("player", players.id), req("provider", 50), req("externalPlayerId", 50), text("jerseyNumber", 10),
    text("externalName"), num("points"), num("twoPointersMade"), num("threePointersMade"),
    num("freeThrowsMade"), num("freeThrowAttempts"), num("fouls"), text("sourceUpdatedAt", 40), text("lastSyncedAt", 40)],
  { listRule: teamAccess("team"), viewRule: teamAccess("team"), ...READ_ONLY }, [
    "CREATE UNIQUE INDEX idx_bb_stats ON basketball_player_game_stats (game, provider, externalPlayerId)",
    "CREATE INDEX idx_bb_stats_player ON basketball_player_game_stats (player)",
  ]);
  app.save(stats);

  // Spieler:in ↔ Provider-Person. Nie automatisch über Namen – nur manuell bestätigt
  // (von Berechtigten der Abteilung oder per Admin-Skript).
  const playerLinks = collection("player_links", [section,
    rel("player", players.id, { required: true, cascadeDelete: true }), req("provider", 50),
    req("externalPlayerId", 50), rel("confirmedBy", users.id), text("confirmedAt", 40)],
  {
    listRule: sectionAccess("section"), viewRule: sectionAccess("section"),
    createRule: `${sectionAccess("section")} && player.section = section && @request.body.confirmedBy = ${ME}`,
    updateRule: null,
    deleteRule: sectionAccess("section"),
  }, [
    "CREATE UNIQUE INDEX idx_player_links_ext ON player_links (section, provider, externalPlayerId)",
    "CREATE UNIQUE INDEX idx_player_links_player ON player_links (player, provider)",
  ]);
  app.save(playerLinks);

  const syncRuns = collection("sync_runs", [section, req("provider", 50), text("mode", 20), text("startedAt", 40),
    text("finishedAt", 40), req("status", 20), json("summary", 200000), text("error", 5000)],
  { listRule: sectionMgmt("section"), viewRule: sectionMgmt("section"), ...READ_ONLY }, [
    "CREATE INDEX idx_sync_runs_section ON sync_runs (section, startedAt)",
  ]);
  app.save(syncRuns);
}, (app) => {
  for (const name of ["sync_runs", "player_links", "basketball_player_game_stats", "standings", "games",
    "team_competitions", "competitions", "team_links"]) {
    app.delete(app.findCollectionByNameOrId(name));
  }
});
