// Spielbetrieb & Verbandsdaten: Sync gegen eine echte PocketBase (Migrationen + Hooks) und eine
// synthetische Verbandswelt im Format von basketball-bund.net. Die Tests bauen aufeinander auf
// (Reihenfolge = Ablauf über mehrere Sync-Läufe).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPocketBase, seedTenants, PASSWORD } from "./harness.js";
import { createClient } from "../../src/sync/client.js";
import { createWorld } from "../../packages/sports-data/test/fixtures/world.js";
import { politeHttp, createBasketballBundProvider, basketballBund } from "../../packages/sports-data/src/index.js";
import { pocketbaseStore } from "../../server/trainerhub-sports/store.js";
import { syncSection, syncAll, MISSING_THRESHOLD } from "../../server/trainerhub-sports/sync.js";

const { PROVIDER } = basketballBund;

const CLUB = 484, OPP1 = 800, OPP2 = 801;
const NOW = new Date("2026-09-27T08:00:00Z");
const at = (date, hour = 20) => new Date(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);

let pb, t, store, world, c = {}, team = {}, T = {};

function provider() {
  return createBasketballBundProvider({ http: politeHttp({ baseUrl: "https://www.basketball-bund.net", fetchImpl: world.fetch, minIntervalMs: 0, sleep: async () => {} }) });
}
const sync = (opts = {}) => syncSection({ store, provider: provider(), section: t.basketball.id, now: NOW, ...opts });
const games = (filter = "") => store.list("games", `section = "${t.basketball.id}"${filter ? " && " + filter : ""}`);
const game = async ext => (await games(`externalId = "${ext}"`))[0];

beforeAll(async () => {
  pb = await startPocketBase();
  t = await seedTenants(pb);
  store = pocketbaseStore(pb.admin);
  for (const n of ["florian", "coach", "other"]) { c[n] = createClient(pb.url); await c[n].login(`${n}@test.local`, PASSWORD); }
  team.u16 = await pb.admin.create("teams", { section: t.basketball.id, name: "U16w", trainers: [t.users.coach.id] });
  team.u14 = await pb.admin.create("teams", { section: t.basketball.id, name: "U14w", trainers: [t.users.florian.id] });
  // bestehende Trainingsdaten, die der Sync nie anfassen darf
  await pb.admin.create("sessions", { id: "u16training00001", team: team.u16.id, date: "2026-09-20", note: "Training" });

  world = createWorld({ today: "2026-09-27" });
  world.league(56442, { name: "BBW2 U16 weiblich Bezirksliga" });
  world.league(56468, { name: "BBW2 U14 weiblich Bezirkspokal", tableExists: false });
  world.league(56492, { name: "BBW2 U14 weiblich Bezirksliga" });
  world.league(53074, { name: "BBW2 Kreisliga A Nord Männer" });
  T.u16 = world.team(189841, 469433, CLUB, "TV Test TITANS");
  T.u14cup = world.team(323401, 469702, CLUB, "TV Test TITANS");
  T.u14 = world.team(323401, 469922, CLUB, "TV Test TITANS");
  T.herren = world.team(154713, 441934, CLUB, "TV Test TITANS");
  T.a = world.team(5001, 9001, OPP1, "Gegner A");
  T.b = world.team(5002, 9002, OPP2, "Gegner B");
  T.a14 = world.team(5003, 9003, OPP1, "Gegner A");
  world.match({ ligaId: 56442, matchId: 1001, matchNo: 16704, matchDay: 2, date: "2026-10-04", time: "17:00", home: T.u16, guest: T.a });
  world.match({ ligaId: 56442, matchId: 1002, matchNo: 16706, matchDay: 3, date: "2026-10-11", time: "09:00", home: T.b, guest: T.u16 });
  world.match({ ligaId: 56442, matchId: 1003, matchNo: 16702, matchDay: 1, date: "2027-01-16", time: "00:00", home: T.a, guest: T.u16 });
  world.match({ ligaId: 56442, matchId: 1009, matchNo: 16799, matchDay: 2, date: "2026-10-04", home: T.a, guest: T.b });  // fremdes Spiel
  world.match({ ligaId: 56468, matchId: 2001, matchNo: 14859, date: "2026-10-04", home: T.a14, guest: T.u14cup });
  world.match({ ligaId: 56492, matchId: 2101, matchNo: 15001, date: "2026-10-10", home: T.u14, guest: T.a14 });
  world.match({ ligaId: 53074, matchId: 3001, matchNo: 19608, date: "2026-10-04", home: T.herren, guest: T.a });
  world.venue(1001, { id: 1076, bezeichnung: "Testhalle", strasse: "Hallenweg 1", plz: "75000", ort: "Teststadt" });
  world.table(56442, [
    { team: T.a, games: 0, wins: 0, losses: 0, points: 0, scored: 0, conceded: 0 },
    { team: T.u16, games: 0, wins: 0, losses: 0, points: 0, scored: 0, conceded: 0 },
  ]);
}, 60000);
afterAll(() => pb?.stop());

describe("Team- und Wettbewerbszuordnung", () => {
  it("ohne Team-Zuordnung wird nichts importiert", async () => {
    const r = await sync();
    expect(r.summary.skipped).toBe("keine Team-Zuordnung");
    expect(world.requests).toEqual([]);
    expect(await games()).toEqual([]);
  });

  it("Team einmal zuordnen → Wettbewerbe und Teilnahmen werden über IDs gefunden, mehrere je Team", async () => {
    await pb.admin.create("team_links", { section: t.basketball.id, team: team.u16.id, provider: PROVIDER, externalTeamId: "189841", externalClubId: String(CLUB), publish: true });
    await pb.admin.create("team_links", { section: t.basketball.id, team: team.u14.id, provider: PROVIDER, externalTeamId: "323401", externalClubId: String(CLUB) });
    const r = await sync();
    expect(r.status).toBe("ok");
    expect(r.summary.newCompetitions.map(x => x.externalId).sort()).toEqual(["56442", "56468", "56492"]);
    const memberships = await store.list("team_competitions", `section = "${t.basketball.id}"`);
    const u14 = memberships.filter(m => m.team === team.u14.id).map(m => m.externalTeamId).sort();
    expect(u14).toEqual(["469702", "469922"]);                        // U14w: Pokal + Liga
    expect(memberships.find(m => m.team === team.u16.id).externalTeamId).toBe("469433");
  });

  it("unbekannte Vereinsmannschaft wird nur gemeldet, nicht importiert", async () => {
    const r = await sync();
    expect(r.summary.unmappedTeams).toEqual([expect.objectContaining({ externalTeamId: "154713", competition: "53074" })]);
    expect(await store.list("competitions", `externalId = "53074"`)).toEqual([]);
    expect(await game("3001")).toBeUndefined();
  });

  it("nur Spiele eigener Teams, mit internen Team-Relationen und Halle", async () => {
    const all = await games();
    expect(all.map(g => g.externalId).sort()).toEqual(["1001", "1002", "1003", "2001", "2101"]);
    const g = await game("1001");
    expect(g).toMatchObject({ homeTeam: team.u16.id, awayTeam: "", homeTeamName: "TV Test TITANS", awayTeamName: "Gegner A",
      homeTeamExternalId: "189841", awayTeamExternalId: "5001", matchNo: "16704", date: "2026-10-04", time: "17:00",
      status: "planned", venue: "Testhalle", venueAddress: "Hallenweg 1, 75000 Teststadt" });
    expect((await game("1003")).time).toBe("");                     // 00:00 = Zeit unbekannt
  });
});

describe("Idempotenz, Verlegung, Ergebnis", () => {
  it("wiederholter Sync erzeugt keine Duplikate", async () => {
    const before = (await games()).length;
    const r = await sync();
    expect(r.summary.games.created).toBe(0);
    expect(r.summary.games.updated).toBe(0);
    expect((await games()).length).toBe(before);
    expect((await store.list("competitions", `section = "${t.basketball.id}"`)).length).toBe(3);
    // Pokal ohne Tabelle, U14-Liga noch ohne Einträge → nur eine offizielle Tabelle
    expect((await store.list("standings", `section = "${t.basketball.id}"`)).length).toBe(1);
  });

  it("verlegtes Spiel aktualisiert denselben Datensatz", async () => {
    const id = (await game("1002")).id;
    world.update(1002, { kickoffDate: "2026-10-18", kickoffTime: "11:00" });
    const r = await sync();
    expect(r.summary.games.rescheduled).toBe(1);
    const g = await game("1002");
    expect(g).toMatchObject({ id, date: "2026-10-18", time: "11:00", previousDate: "2026-10-11" });
  });

  it("Ergebnis mit Vierteln und Verlängerung, Tabelle aktualisiert", async () => {
    world.update(1001, { result: "80:78" });
    world.quarters(1001, [20, 15, 15, 20, 5, 5], [20, 15, 15, 20, 5, 3]);
    world.table(56442, [
      { team: T.u16, games: 1, wins: 1, losses: 0, points: 2, scored: 80, conceded: 78 },
      { team: T.a, games: 1, wins: 0, losses: 1, points: 0, scored: 78, conceded: 80 },
    ]);
    const r = await sync({ now: at("2026-10-04") });
    expect(r.status).toBe("ok");
    const g = await game("1001");
    expect(g).toMatchObject({ status: "finished", homeScore: 80, awayScore: 78 });
    expect(g.periods.map(p => `${p.label} ${p.home}:${p.away}`)).toEqual(["Q1 20:20", "Q2 15:15", "Q3 15:15", "Q4 20:20", "OT1 5:5", "OT2 5:3"]);
    const [s] = await store.list("standings", `competition.externalId = "56442"`);
    expect(s.entries[0]).toMatchObject({ rank: 1, teamExternalId: "189841", wins: 1, points: 2, difference: 2 });
  });

  it("korrigiertes Ergebnis ersetzt das alte, Viertel werden neu geholt", async () => {
    world.update(1001, { result: "80:77" });
    world.quarters(1001, [20, 15, 15, 20, 5, 5], [20, 15, 15, 20, 5, 2]);
    await sync({ now: at("2026-10-05") });
    const g = await game("1001");
    expect([g.homeScore, g.awayScore, g.periods.at(-1).away]).toEqual([80, 77, 2]);
  });

  it("abgesagtes Spiel: Status aus der Quelle, Datensatz bleibt", async () => {
    world.update(2001, { abgesagt: true });
    await sync({ now: at("2026-10-05") });
    expect((await game("2001")).status).toBe("cancelled");
  });

  it("aus der Quelle verschwundenes Spiel wird nicht sofort gelöscht", async () => {
    world.remove(2101);
    for (let i = 0; i < MISSING_THRESHOLD; i++) await sync({ now: at("2026-10-05") });
    const g = await game("2101");
    expect(g.missingCount).toBe(MISSING_THRESHOLD);
  });

  it("unvollständige Daten (Spiel ohne Datum) werden übersprungen und gemeldet", async () => {
    world.match({ ligaId: 56442, matchId: 1010, date: "", home: T.u16, guest: T.b });
    const r = await sync({ now: at("2026-10-05") });
    expect(r.summary.warnings).toEqual([expect.objectContaining({ game: "1010" })]);
    expect(await game("1010")).toBeUndefined();
    world.remove(1010);
  });
});

describe("Spielerstatistik und Spieler-Zuordnung", () => {
  it("nur eigene Spielerinnen, nur wenn geliefert; keine automatische Namenszuordnung", async () => {
    await pb.admin.create("players", { id: "lena00000000001", section: t.basketball.id, name: "Lena Muster" });
    await pb.admin.create("players", { id: "lena00000000002", section: t.basketball.id, name: "Lena Muster" });
    world.boxscore(1001, {
      home: [
        { id: 111, first: "Lena", last: "Muster", no: 7, pts: 20, two: 7, three: 1, ftm: 3, fta: 4, fouls: 2 },
        { id: 112, first: "Lena", last: "Muster", no: 9, pts: 4, two: 2, fouls: 1 },
        { anonym: true, no: 12, pts: 6 },
      ],
      guest: [{ id: 999, first: "Gast", last: "Spielerin", pts: 30 }],
    });
    const r = await sync({ now: at("2026-10-06", 6) });   // ≥ 6 h nach der letzten Prüfung
    expect(r.summary.stats.games).toBe(1);
    const rows = await store.list("basketball_player_game_stats", `game.externalId = "1001"`);
    expect(rows.map(x => x.externalPlayerId).sort()).toEqual(["111", "112"]);   // kein Gast, keine anonyme Person
    expect(rows.every(x => x.player === "" && x.team === team.u16.id)).toBe(true);
    expect(rows.find(x => x.externalPlayerId === "111")).toMatchObject({ points: 20, twoPointersMade: 7, threePointersMade: 1, freeThrowsMade: 3, freeThrowAttempts: 4, fouls: 2 });
  });

  it("manuelle Bestätigung durch Berechtigte; nächste Läufe nutzen die externe ID", async () => {
    // Trainerin des Teams bestätigt: externe Person 112 = zweite „Lena Muster“
    await c.coach.create("player_links", { section: t.basketball.id, player: "lena00000000002", provider: PROVIDER, externalPlayerId: "112", confirmedBy: t.users.coach.id });
    // Fremder Verein darf nicht zuordnen; niemand darf im Namen anderer bestätigen
    await expect(c.other.create("player_links", { section: t.basketball.id, player: "lena00000000001", provider: PROVIDER, externalPlayerId: "111", confirmedBy: t.users.other.id })).rejects.toMatchObject({ status: 400 });
    await expect(c.coach.create("player_links", { section: t.basketball.id, player: "lena00000000001", provider: PROVIDER, externalPlayerId: "111", confirmedBy: t.users.florian.id })).rejects.toMatchObject({ status: 400 });
    const r = await sync({ now: at("2026-10-06", 8) });   // ohne erneuten Boxscore-Abruf: nur Zuordnung übertragen
    expect(r.summary.stats.relinked).toBe(1);
    const rows = await store.list("basketball_player_game_stats", `game.externalId = "1001"`);
    expect(Object.fromEntries(rows.map(x => [x.externalPlayerId, x.player]))).toEqual({ 111: "", 112: "lena00000000002" });
  });

  it("Boxscore nur mit Nullen → keine Statistikzeilen", async () => {
    world.update(1002, { result: "50:40" });
    world.boxscore(1002, { guest: [{ id: 111, first: "Lena", last: "Muster" }] });
    const r = await sync({ now: at("2026-10-18") });
    expect(r.summary.stats.unavailable).toBeGreaterThanOrEqual(1);
    expect(await store.list("basketball_player_game_stats", `game.externalId = "1002"`)).toEqual([]);
  });
});

describe("Fehlerverhalten", () => {
  it("Quelle nicht erreichbar: Lauf protokolliert Fehler, vorhandene Daten bleiben", async () => {
    const before = await games();
    world.down = true;
    const r = await sync({ now: at("2026-10-19") });
    world.down = false;
    expect(r.status).toBe("error");
    expect(r.run.error).toMatch(/nicht erreichbar/);
    expect(await games()).toEqual(before);
  });

  it("unbekannter/entfernter Wettbewerb: Fehler für diesen, die anderen laufen weiter", async () => {
    const comp = (await store.list("competitions", `externalId = "56492"`))[0];
    await pb.admin.patch("competitions", comp.id, { externalId: "48109" });   // existiert in der Quelle nicht
    const r = await sync({ now: at("2026-10-19") });
    expect(r.status).toBe("partial");
    expect(r.summary.errors).toEqual([expect.objectContaining({ step: "schedule", competition: "48109" })]);
    expect(r.summary.competitions).toBeGreaterThanOrEqual(2);
    await pb.admin.patch("competitions", comp.id, { externalId: "56492" });
  });

  it("Spieltag-Modus fragt nur bei eigenen Spielen an", async () => {
    world.requests.length = 0;
    const idle = await sync({ mode: "gameday", now: at("2026-10-28", 12) });
    expect(idle.summary.skipped).toBe("kein Spieltag");
    expect(world.requests).toEqual([]);
    await sync({ mode: "gameday", now: at("2026-10-18", 16) });
    expect(world.requests.some(p => p.includes("/spielplan/id/56442"))).toBe(true);
    expect(world.requests.some(p => p.includes("/club/"))).toBe(false);
  });
});

describe("Saisonwechsel", () => {
  it("zweite Saison: neue Wettbewerbe über dieselbe Team-Zuordnung, alte bleiben unangetastet", async () => {
    const oldGames = await games();
    world.league(60001, { name: "BBW2 U18 weiblich Bezirksliga", season: 2027 });
    const next = world.team(189841, 480001, CLUB, "TV Test TITANS");
    world.match({ ligaId: 60001, matchId: 4001, date: "2027-09-26", home: next, guest: T.b });
    world.today = "2027-09-20";
    world.requests.length = 0;
    const r = await sync({ now: at("2027-09-20", 3) });
    expect(r.summary.season).toBe("2027");
    expect(r.summary.newCompetitions.map(x => x.externalId)).toEqual(["60001"]);
    expect(world.requests.some(p => p.includes("/spielplan/id/56442"))).toBe(false);   // Vorsaison wird nicht mehr abgefragt
    const g = await game("4001");
    expect(g.homeTeam).toBe(team.u16.id);
    for (const old of oldGames) expect(await game(old.externalId)).toEqual(old);
    world.today = "2026-09-27";
  });
});

describe("Mandanten, Rechte, Datenhoheit", () => {
  it("Verein B mit derselben Provider-Mannschaft: getrennte Datensätze, syncAll je Abteilung", async () => {
    await pb.admin.create("team_links", { section: t.otherTeam.section, team: t.otherTeam.id, provider: PROVIDER, externalTeamId: "189841", externalClubId: String(CLUB) });
    const countA = (await games()).length;
    const results = await syncAll({ store, provider: provider(), now: NOW });
    expect(results.map(r => r.section).sort()).toEqual([t.basketball.id, t.otherTeam.section].sort());
    const b = await store.list("games", `section = "${t.otherTeam.section}"`);
    expect(b.length).toBeGreaterThan(0);
    expect(b.every(g => g.homeTeam === t.otherTeam.id || g.awayTeam === t.otherTeam.id)).toBe(true);
    expect((await games()).length).toBe(countA);
    const extA = (await game("1001")).id, extB = b.find(g => g.externalId === "1001").id;
    expect(extA).not.toBe(extB);
  });

  it("Lesen nur im eigenen Scope; schreiben können Benutzer:innen Provider-Daten nie", async () => {
    const ids = xs => xs.map(x => x.externalId).sort();
    expect(ids(await c.coach.listAll("games"))).toEqual(["1001", "1002", "1003", "4001"]);          // nur U16w
    expect(ids(await c.florian.listAll("games"))).toEqual(["1001", "1002", "1003", "2001", "2101", "4001"]);   // Vereins-Admin A
    expect((await c.other.listAll("games")).every(g => g.section === t.otherTeam.section)).toBe(true);
    expect((await c.other.listAll("basketball_player_game_stats")).every(x => x.section === t.otherTeam.section)).toBe(true);
    expect((await c.florian.listAll("basketball_player_game_stats")).length).toBe(2);
    expect(await c.coach.listAll("sync_runs")).toEqual([]);                                             // nur Leitung/Admin
    const g = await game("1001");
    await expect(c.florian.update("games", g.id, { homeScore: 1 })).rejects.toBeTruthy();
    await expect(c.florian.create("games", { section: t.basketball.id, competition: g.competition, provider: "x", externalId: "1", date: "2026-01-01", status: "planned" })).rejects.toBeTruthy();
    await expect(c.coach.create("team_links", { section: t.basketball.id, team: team.u16.id, provider: "y", externalTeamId: "1" })).rejects.toBeTruthy();
    const anon = await fetch(`${pb.url}/api/collections/games/records`);
    expect((await anon.json()).items).toEqual([]);
  });

  it("Trainingsdaten bleiben unverändert", async () => {
    expect(await store.list("sessions", `team = "${team.u16.id}"`)).toEqual([expect.objectContaining({ id: "u16training00001", note: "Training" })]);
  });
});

describe("Öffentlicher Feed für GameDay/Scoreboard (v1)", () => {
  const feed = async (path) => { const r = await fetch(`${pb.url}/api/trainerhub/sports/v1/${path}`); return { status: r.status, body: await r.json() }; };

  it("nur veröffentlichte Teams, keine Personendaten, ohne Anmeldung", async () => {
    const { status, body } = await feed(`games?section=${t.basketball.id}&from=2026-09-01&to=2027-12-31`);
    expect(status).toBe(200);
    expect(body.version).toBe(1);
    expect(body.games.map(g => g.externalId)).toEqual(["1001", "1002", "1003", "4001"]);   // U16w ist veröffentlicht, U14w nicht
    const g = body.games[0];
    expect(g).toMatchObject({ date: "2026-10-04", time: "17:00", status: "finished", competition: { name: "BBW2 U16 weiblich Bezirksliga", externalId: "56442" },
      home: { name: "TV Test TITANS", score: 80, team: { id: team.u16.id, name: "U16w" } }, away: { name: "Gegner A", score: 77, team: null },
      venue: { name: "Testhalle", address: "Hallenweg 1, 75000 Teststadt" } });
    expect(g.periods).toHaveLength(6);
    expect(body.games.find(x => x.externalId === "1003")).toMatchObject({ time: null, home: { score: null }, periods: null });
    expect(JSON.stringify(body)).not.toMatch(/Lena|Muster|trainers|players|externalPlayerId/);
  });

  it("Tabellen der veröffentlichten Teams", async () => {
    const { body } = await feed(`standings?section=${t.basketball.id}`);
    expect(body.standings.map(s => s.competition.externalId)).toEqual(["56442"]);
    expect(body.standings[0].team).toMatchObject({ name: "U16w", externalId: "469433" });
    expect(body.standings[0].entries[0]).toMatchObject({ rank: 1, teamExternalId: "189841" });
  });

  it("ungültige Parameter werden abgelehnt, fremde/unveröffentlichte Abteilung liefert nichts", async () => {
    expect((await feed("games?section=bad%22id")).status).toBe(400);
    expect((await feed(`games?section=${t.basketball.id}&from=2026-13`)).status).toBe(400);
    expect((await feed(`games?section=${t.otherTeam.section}`)).body.games).toEqual([]);
  });
});
