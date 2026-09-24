import { describe, it, expect } from "vitest";
import { migrate, computeRanking, countPresent, calcFactor, getActiveSeason, allGamedays } from "./data.js";
import { INIT } from "./constants.js";

describe("migrate", () => {
  it("ergänzt fehlende Sammlungen", () => {
    const d = migrate({ players: [], teams: [], sessions: [], trainingTypes: [] });
    expect(d.plannedSessions).toEqual([]);
    expect(d.seasons).toEqual([]);
    expect(d.settings).toEqual({ trainerName: "" });
    expect(d.venues).toEqual(INIT.venues);
  });

  it("überführt das alte Format team.players in globale Spieler:innen", () => {
    const d = migrate({
      teams: [
        { id: "a", name: "U14", players: [{ id: "p1", name: "Anna" }, { id: "p2", name: "Bea" }] },
        { id: "b", name: "U16", players: [{ id: "p1", name: "Anna" }] },
      ],
      sessions: [],
    });
    expect(d.players.map(p => p.id)).toEqual(["p1", "p2"]);
    expect(d.teams[0].playerIds).toEqual(["p1", "p2"]);
    expect(d.teams[1].playerIds).toEqual(["p1"]);
    expect(d.teams[0].players).toBeUndefined();
  });

  it("bleibt kompatibel mit alten Datenständen, die noch ein emoji-Feld enthalten", () => {
    const legacy = {
      players: [], teams: [], sessions: [], plannedSessions: [], seasons: [], settings: { trainerName: "" },
      trainingTypes: [{ id: "tt1", name: "Basketball", duration: 90, emoji: "🏀" }],
      venues: [{ id: "v1", name: "Jahnhalle", address: "Postweg", emoji: "🏛️" }],
    };
    const d = migrate(JSON.parse(JSON.stringify(legacy)));
    expect(d).toEqual(legacy);   // keine Migration nötig, Feld wird nur nicht mehr angezeigt
  });

  it("lässt aktuelle Daten unverändert", () => {
    const cur = JSON.parse(JSON.stringify({ ...INIT, sessions: [{ id: "s" }] }));
    expect(migrate(JSON.parse(JSON.stringify(cur)))).toEqual(cur);
  });
});

describe("Fachlogik", () => {
  const data = {
    players: [{ id: "a", name: "Anna" }, { id: "b", name: "Bea" }, { id: "c", name: "Cleo" }],
    teams: [{ id: "t", name: "U16", playerIds: ["a", "b", "c"] }],
    trainingTypes: [{ id: "bb", name: "Basketball" }],
  };
  const sessions = [
    { teamId: "t", trainingTypeId: "bb", factor: 1.5, attendance: [
      { playerId: "a", status: "present" }, { playerId: "b", status: "injured_present" }, { playerId: "c", status: "absent" }] },
    { teamId: "t", trainingTypeId: "bb", factor: 1, attendance: [
      { playerId: "a", status: "present" }, { playerId: "b", status: "excused" }, { playerId: "c", status: "present" }] },
  ];

  it("Faktor = Dauer / 60, eine Nachkommastelle", () => {
    expect(calcFactor(90)).toBe(1.5);
    expect(calcFactor(75)).toBe(1.3);
  });

  it("zählt Anwesende inkl. verletzt-dabei", () => {
    expect(countPresent(sessions[0])).toBe(2);
  });

  it("Ranking: Punkte = Σ Faktor × Statusfaktor", () => {
    const r = computeRanking(data, "t", sessions);
    expect(r.map(x => [x.player.id, x.pts, x.cnt, x.pct, x.commits])).toEqual([
      ["a", 2.5, 2, 100, 0],
      ["c", 1, 1, 50, 0],
      ["b", 0.8, 1, 50, 1],   // 1,5 × 0,5 = 0,75 → gerundet 0,8
    ]);
    expect(r[0].byType).toEqual({ Basketball: 2 });
  });

  it("aktive Saison ignoriert abgeschlossene", () => {
    const seasons = [
      { id: "old", teamId: "t", startDate: "2025-09-01", phase: "saison" },
      { id: "new", teamId: "t", startDate: "2026-09-01", phase: "abgeschlossen" },
    ];
    expect(getActiveSeason("t", seasons)?.id).toBe("old");
  });

  it("sammelt Spieltage aller Saisons mit Team-Bezug", () => {
    const g = allGamedays({ seasons: [{ id: "s", teamId: "t", gamedays: [{ id: "g", date: "2026-09-27" }] }] });
    expect(g).toEqual([{ id: "g", date: "2026-09-27", teamId: "t", seasonId: "s" }]);
  });
});
