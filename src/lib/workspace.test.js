import { describe, it, expect } from "vitest";
import {
  activeSeason, isHistorical, seasonAt, roster, trainingRoster, usesSeasonRoster, addToRoster, removeFromRoster, createPlayer,
  createSeason, takeOverCandidates, newObservation, addObservation, linkObservations, playerObservations, sessionObservations,
  observationThemes, playerAttendance, goalCoverage, newGoal, teamGames, agenda, rosterEntryId, updateRosterEntry,
} from "./workspace.js";
import { removeSession, recordSession } from "./training.js";

const TODAY = "2026-09-27";
const base = () => ({
  players: [{ id: "ina", name: "Ina" }, { id: "mia", name: "Mia" }, { id: "lea", name: "Lea" }],
  teams: [{ id: "u16", name: "U16w", playerIds: ["ina", "mia"] }, { id: "u18", name: "U18w", playerIds: [] }, { id: "u14", name: "U14w", playerIds: ["lea"] }],
  seasons: [
    { id: "s25", teamId: "u16", name: "2025/26", startDate: "2025-08-01", endDate: "2026-06-30", phase: "abgeschlossen" },
    { id: "s26", teamId: "u16", name: "2026/27", startDate: "2026-08-01", endDate: "2027-06-30", phase: "saison", gamedays: [] },
  ],
  sessions: [], plannedSessions: [],
});

describe("Saison", () => {
  it("aktive Saison: heute im Zeitraum und nicht abgeschlossen; sonst jüngste offene; Team ohne Saison: keine", () => {
    const d = base();
    expect(activeSeason("u16", d, TODAY).id).toBe("s26");
    expect(activeSeason("u16", d, "2026-07-15").id).toBe("s26");          // Vorbereitung vor Beginn
    expect(activeSeason("u18", d, TODAY)).toBeNull();
    d.seasons[1].phase = "abgeschlossen";
    expect(activeSeason("u16", d, TODAY)).toBeNull();
  });
  it("historische Saison und Saison eines Tages", () => {
    const d = base();
    expect(isHistorical(d.seasons[0], TODAY)).toBe(true);
    expect(isHistorical(d.seasons[1], TODAY)).toBe(false);
    expect(seasonAt("u16", "2026-03-01", d).id).toBe("s25");
    expect(seasonAt("u16", "2026-07-10", d)).toBeNull();
  });
});

describe("Saisonkader", () => {
  it("ohne Saisonkader gilt die bisherige Teamliste (auch für Teams ohne Saison)", () => {
    const d = base();
    expect(usesSeasonRoster("u16", d)).toBe(false);
    expect(roster("u16", d.seasons[1], d).map(r => r.player.id)).toEqual(["ina", "mia"]);
    expect(roster("u14", null, d).map(r => r.player.id)).toEqual(["lea"]);
    expect(trainingRoster("u16", TODAY, d).map(p => p.id)).toEqual(["ina", "mia"]);
  });

  it("aufnehmen: bisherige Teamliste wird Kader dieser Saison, deterministische IDs, kein Duplikat", () => {
    const d0 = base();
    let d = addToRoster(d0, { teamId: "u16", season: d0.seasons[1], playerId: "lea" });
    expect(roster("u16", d.seasons[1], d).map(r => r.player.id)).toEqual(["ina", "lea", "mia"]);
    expect(d.rosterEntries.map(e => e.id)).toContain(rosterEntryId("s26", "lea"));
    expect(addToRoster(d, { teamId: "u16", season: d.seasons[1], playerId: "lea" })).toBe(d);
    expect(d.teams[0].playerIds).toEqual(["ina", "mia"]);                   // Teamliste unangetastet
  });

  it("entfernen ohne Historienverlust: Status „nicht mehr im Kader“, Anwesenheit/Beobachtung bleiben", () => {
    let d = base();
    d = recordSession(d, { id: "t1", teamId: "u16", date: "2026-09-20", durationMinutes: 90, attendance: [{ playerId: "mia", status: "present" }] });
    d = addObservation(d, newObservation({ teamId: "u16", playerId: "mia", date: "2026-09-20", text: "Gute Helpside", user: { id: "u1", name: "A" } }));
    d = removeFromRoster(d, { teamId: "u16", season: d.seasons[1], playerId: "mia" });
    expect(roster("u16", d.seasons[1], d, { statuses: ["active"] }).map(r => r.player.id)).toEqual(["ina"]);
    expect(roster("u16", d.seasons[1], d).find(r => r.player.id === "mia").entry.status).toBe("left");
    expect(d.players.some(p => p.id === "mia")).toBe(true);
    expect(playerObservations("mia", d)).toHaveLength(1);
    expect(playerAttendance("mia", "u16", d.seasons[1], d)).toEqual({ present: 1, listed: 1 });
    // Zurückholen
    d = addToRoster(d, { teamId: "u16", season: d.seasons[1], playerId: "mia" });
    expect(roster("u16", d.seasons[1], d, { statuses: ["active"] }).map(r => r.player.id)).toEqual(["ina", "mia"]);
  });

  it("pausiert zählt nicht für die Anwesenheit, bleibt aber im Kader", () => {
    let d = addToRoster(base(), { teamId: "u16", season: base().seasons[1], playerId: "lea" });
    d = updateRosterEntry(d, rosterEntryId("s26", "mia"), { status: "paused" });
    expect(trainingRoster("u16", TODAY, d).map(p => p.id)).toEqual(["ina", "lea"]);
    expect(roster("u16", d.seasons[1], d).length).toBe(3);
  });

  it("neue Person direkt in den Kader", () => {
    const d0 = base();
    const { data, player } = createPlayer(d0, { teamId: "u16", season: d0.seasons[1], name: "  Zoe ", birthYear: 2011 });
    expect(player).toMatchObject({ name: "Zoe", birthYear: 2011 });
    expect(roster("u16", data.seasons[1], data).map(r => r.player.name)).toContain("Zoe");
  });

  it("Saisonwechsel: neue Saison übernimmt ausgewählte Personen, alter Kader bleibt; Wechsel in anderes Team", () => {
    let d = base();
    expect(takeOverCandidates("u16", d, TODAY).map(p => p.id)).toEqual(["ina", "mia"]);
    const r = createSeason(d, { teamId: "u16", name: "2027/28", startDate: "2027-08-01", endDate: "2028-06-30", takeOver: ["ina"], today: TODAY });
    d = r.data;
    expect(roster("u16", d.seasons.find(s => s.id === "s26"), d).map(x => x.player.id)).toEqual(["ina", "mia"]);   // alte Saison erhalten
    expect(roster("u16", r.season, d).map(x => x.player.id)).toEqual(["ina"]);
    // Mia wechselt nächstes Jahr in die U18w
    const u18 = createSeason(d, { teamId: "u18", name: "2027/28", startDate: "2027-08-01", endDate: "2028-06-30", takeOver: [], today: TODAY });
    d = addToRoster(u18.data, { teamId: "u18", season: u18.season, playerId: "mia" });
    expect(roster("u18", u18.season, d).map(x => x.player.id)).toEqual(["mia"]);
    expect(roster("u16", d.seasons.find(s => s.id === "s26"), d).map(x => x.player.id)).toContain("mia");
  });
});

describe("Beobachtungen", () => {
  const user = { id: "coachA", name: "Florian" };
  it("gehören zugleich zur Person und zum Training (ein Datensatz, kein Duplikat)", () => {
    let d = { ...base(), plannedSessions: [{ id: "p1", teamId: "u16", date: "2026-09-24", durationMinutes: 90 }] };
    const o = newObservation({ teamId: "u16", playerId: "ina", date: "2026-09-24", text: " Öffnet sich zu spät ", tags: ["Pressbreak"], planId: "p1", user,
      now: new Date("2026-09-24T18:40:00Z") });
    d = addObservation(d, o);
    expect(addObservation(d, o)).toBe(d);                                  // Doppeltipp
    // vor dem Abschluss: über die Planung dem Training zugeordnet
    const sess = { id: "sess1", teamId: "u16", planId: "p1", date: "2026-09-24", durationMinutes: 90, attendance: [] };
    expect(sessionObservations(sess, d).map(x => x.text)).toEqual(["Öffnet sich zu spät"]);
    d = linkObservations(recordSession(d, sess), [o.id], "sess1");
    expect(d.observations).toHaveLength(1);
    expect(sessionObservations(sess, d)[0]).toMatchObject({ sessionId: "sess1", createdBy: "coachA", authorName: "Florian" });
    expect(playerObservations("ina", d)[0].id).toBe(o.id);
    // Training gelöscht → Beobachtung bleibt, Verweis entfällt
    d = removeSession(d, "sess1");
    expect(d.observations[0]).toMatchObject({ id: o.id, sessionId: "" });
    expect(playerObservations("ina", d)).toHaveLength(1);
  });

  it("Verlauf neueste zuerst, nach Saison filterbar; Themen nur als Häufigkeit", () => {
    let d = base();
    const add = (date, text, tags) => { d = addObservation(d, newObservation({ teamId: "u16", playerId: "ina", date, text, tags, user })); };
    add("2026-09-10", "Linke Hand unsicher", ["Ballhandling"]);
    add("2026-09-24", "Zu spät geöffnet", ["Pressbreak"]);
    add("2026-09-17", "Starke Helpside", ["Defense"]);
    add("2026-09-20", "Linke Hand unter Druck", ["ballhandling"]);
    add("2026-03-01", "Alte Saison", ["Ballhandling"]);
    expect(playerObservations("ina", d, { season: d.seasons[1] }).map(o => o.date)).toEqual(["2026-09-24", "2026-09-20", "2026-09-17", "2026-09-10"]);
    // Groß-/Kleinschreibung zählt nicht; angezeigt wird die jüngste Schreibweise
    expect(observationThemes(playerObservations("ina", d, { season: d.seasons[1] }))).toEqual([{ tag: "ballhandling", count: 2 }]);
  });
});

describe("Saisonziele und Trainingsinhalte", () => {
  it("nur Anzahl und Minuten der Trainings mit dem Thema – kein Fortschritt", () => {
    const sessions = [
      { date: "2026-09-10", durationMinutes: 90, tags: ["Pressbreak"] },
      { date: "2026-09-17", durationMinutes: 60, tags: ["pressbreak", "Wurf"] },
      { date: "2026-09-24", durationMinutes: 90, tags: ["Wurf"] },
    ];
    expect(goalCoverage(newGoal("Pressbreak stabilisieren", ["Pressbreak"]), sessions)).toEqual({ count: 2, minutes: 150, last: "2026-09-17" });
    expect(goalCoverage(newGoal("Mehr Entscheidungen ohne Dribbling"), sessions)).toBeNull();
  });
});

describe("Spiele und Als Nächstes", () => {
  it("ohne Sports Data: manuelle Spieltage; mit Sports Data: externe Spiele aus Teamsicht", () => {
    const d = base();
    d.seasons[1].gamedays = [{ id: "g1", date: "2026-10-03", opponent: "Karlsruhe", isHome: true, result: "" }];
    expect(teamGames("u16", d).map(g => [g.source, g.opponent])).toEqual([["manual", "Karlsruhe"]]);
    d.competitions = [{ id: "c1", name: "Bezirksliga" }];
    d.externalGames = [
      { id: "e1", competitionId: "c1", homeTeamId: "", awayTeamId: "u16", date: "2026-10-04", time: "14:00", homeTeamName: "Gegner A", awayTeamName: "TV Bretten", status: "planned", homeScore: 0, awayScore: 0 },
      { id: "e0", competitionId: "c1", homeTeamId: "u16", awayTeamId: "", date: "2026-09-20", time: "15:00", homeTeamName: "TV Bretten", awayTeamName: "Gegner B", status: "finished", homeScore: 60, awayScore: 55 },
      { id: "ex", competitionId: "c1", homeTeamId: "u16", awayTeamId: "", date: "2026-10-10", homeTeamName: "TV Bretten", awayTeamName: "Weg", status: "planned", missingCount: 3 },
    ];
    const games = teamGames("u16", d);
    expect(games.map(g => g.key)).toEqual(["games:e0", "gameday:g1", "games:e1"]);
    expect(games[2]).toMatchObject({ source: "external", opponent: "Gegner A", isHome: false, time: "14:00", competition: "Bezirksliga" });
    expect(games[0]).toMatchObject({ result: "60:55", isHome: true });
    const a = agenda("u16", d, TODAY);
    expect(a.nextGame.key).toBe("gameday:g1");
    expect(a.lastGame.key).toBe("games:e0");
  });

  it("nächstes Training, heutiges Training, kein Training", () => {
    const d = { ...base(), plannedSessions: [
      { id: "p0", teamId: "u16", date: "2026-09-25" },
      { id: "p1", teamId: "u16", date: TODAY, time: "18:30" },
      { id: "p2", teamId: "u16", date: "2026-10-01" },
      { id: "px", teamId: "u14", date: TODAY },
    ] };
    const a = agenda("u16", d, TODAY);
    expect([a.todayPlan.id, a.nextPlan.id, a.overdue.map(p => p.id)]).toEqual(["p1", "p2", ["p0"]]);
    expect(agenda("u18", d, TODAY)).toMatchObject({ todayPlan: null, nextPlan: null, nextGame: null, lastSession: null });
  });
});
