import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { politeHttp, ProviderError, createBasketballBundProvider, basketballBund, normalizeName, nameCandidates, SCHEMA_VERSION } from "../src/index.js";
import { createWorld } from "./fixtures/world.js";

const { normalizeMatch, normalizePeriods, normalizeStandings, normalizeBoxscoreSide, parseScore } = basketballBund;
const FIX = join(import.meta.dirname, "fixtures");
const fixture = name => JSON.parse(readFileSync(join(FIX, name), "utf8"));
const fastHttp = fetchImpl => politeHttp({ baseUrl: "https://example.test", fetchImpl, minIntervalMs: 0, sleep: async () => {} });

describe("basketball-bund.net – Normalisierung (anonymisierte echte Antworten)", () => {
  it("Spiel: stabile IDs, Ergebnis, Status", () => {
    const data = fixture("match-info-2946251.json").data;
    const g = normalizeMatch(data);
    expect(g).toMatchObject({
      externalId: "2946251", competitionExternalId: "53074", matchNo: "19602", matchDay: 1, date: "2026-09-26", time: "09:30",
      homeScore: 65, awayScore: 58, status: "finished", forfeit: false, resultConfirmed: false,
      home: { externalId: "167085", seasonTeamId: "450814", clubId: "809" },
      away: { externalId: "154713", seasonTeamId: "441934", clubId: "484", name: "TV Bretten TITANS" },
    });
  });

  it("Viertel: Quelle liefert Einzelwerte je Viertel („Halbzeitstand“ = 2. Viertel)", () => {
    const periods = normalizePeriods(fixture("match-info-2946251.json").data.matchResult);
    expect(periods.map(p => `${p.home}:${p.away}`)).toEqual(["13:10", "13:10", "17:10", "22:28"]);
  });

  it("Viertel: kumulative Werte werden erkannt, Verlängerungen einzeln, Unstimmiges verworfen", () => {
    const cum = { heimEndstand: 65, gastEndstand: 58, heimV1stand: 13, gastV1stand: 10, heimHalbzeitstand: 26, gastHalbzeitstand: 20,
      heimV3stand: 43, gastV3stand: 30, heimV4stand: 65, gastV4stand: 58 };
    expect(normalizePeriods(cum).map(p => `${p.home}:${p.away}`)).toEqual(["13:10", "13:10", "17:10", "22:28"]);
    const ot = { heimEndstand: 80, gastEndstand: 78, heimV1stand: 20, gastV1stand: 20, heimHalbzeitstand: 15, gastHalbzeitstand: 15,
      heimV3stand: 15, gastV3stand: 15, heimV4stand: 20, gastV4stand: 20, heimOt1stand: 5, gastOt1stand: 5, heimOt2stand: 5, gastOt2stand: 3 };
    expect(normalizePeriods(ot).map(p => p.label)).toEqual(["Q1", "Q2", "Q3", "Q4", "OT1", "OT2"]);
    expect(normalizePeriods({ ...cum, heimV4stand: 1 })).toBeNull();
    expect(normalizePeriods({ heimEndstand: null })).toBeNull();
  });

  it("Tabelle: offizielle Werte unverändert übernommen", () => {
    const entries = normalizeStandings(fixture("table-53074.json").data.tabelle);
    expect(entries[0]).toMatchObject({ rank: 1, teamExternalId: "218079", games: 1, wins: 1, losses: 0, points: 2, scored: 95, conceded: 66, difference: 29 });
    expect(entries.every(e => e.teamExternalId && e.teamName)).toBe(true);
  });

  it("Boxscore nur mit Nullen gilt als „keine Statistik“ – keine Schein-Nullen", () => {
    const b = fixture("boxscore-2946251-empty.json").data.matchBoxscore;
    const side = normalizeBoxscoreSide(b.guestPlayerStats);
    expect(side.available).toBe(false);
    expect(side.players).toEqual([]);
  });

  it("Zeit 00:00 = unbekannt, abgesagt = cancelled, Freilos wird ignoriert", () => {
    const w = createWorld();
    w.league(1, { name: "L" });
    const a = w.team(10, 100, 5, "A"), b = w.team(11, 101, 6, "B");
    expect(normalizeMatch(w.match({ ligaId: 1, matchId: 1, date: "2026-10-01", time: "00:00", home: a, guest: b })).time).toBe("");
    expect(normalizeMatch(w.match({ ligaId: 1, matchId: 2, date: "2026-10-01", home: a, guest: b, abgesagt: true })).status).toBe("cancelled");
    expect(normalizeMatch(w.match({ ligaId: 1, matchId: 3, date: "2026-10-01", home: a, guest: null }))).toBeNull();
    expect(parseScore("20:0")).toEqual({ home: 20, away: 0 });
    expect(parseScore("-:-")).toBeNull();
  });
});

describe("Provider-Adapter über HTTP", () => {
  it("unbekannter Wettbewerb → ProviderError notFound", async () => {
    const p = createBasketballBundProvider({ http: fastHttp(async () => ({ ok: true, status: 200, json: async () => fixture("not-found-48109.json") })) });
    await expect(p.schedule("48109")).rejects.toMatchObject({ name: "ProviderError", notFound: true });
  });

  it("Saison beginnt am 1. Juli", () => {
    const p = createBasketballBundProvider({ http: fastHttp(async () => ({})) });
    expect(p.seasonFor("2026-09-27")).toBe("2026");
    expect(p.seasonFor("2027-03-01")).toBe("2026");
    expect(p.seasonFor("2027-07-01")).toBe("2027");
  });
});

describe("höflicher HTTP-Client", () => {
  it("streng nacheinander, mit Mindestabstand und Cache je Lauf", async () => {
    let t = 0, active = 0, maxActive = 0;
    const slept = [];
    const http = politeHttp({
      baseUrl: "https://x.test", minIntervalMs: 1000, now: () => t, sleep: async ms => { slept.push(ms); t += ms; },
      fetchImpl: async () => { active++; maxActive = Math.max(maxActive, active); await Promise.resolve(); active--; return { ok: true, status: 200, json: async () => ({ ok: 1 }) }; },
    });
    await Promise.all([http.getJson("/a"), http.getJson("/b"), http.getJson("/a")]);
    expect(maxActive).toBe(1);
    expect(http.stats).toMatchObject({ requests: 2, cached: 1 });
    expect(slept).toEqual([1000]);
  });

  it("wiederholt nur bei 5xx/Netzwerk, nicht bei 4xx", async () => {
    let calls = 0;
    const flaky = politeHttp({ baseUrl: "", minIntervalMs: 0, sleep: async () => {}, retries: 2,
      fetchImpl: async () => { calls++; return calls < 3 ? { ok: false, status: 503 } : { ok: true, status: 200, json: async () => ({ v: 1 }) }; } });
    expect(await flaky.getJson("/x")).toEqual({ v: 1 });
    expect(calls).toBe(3);
    calls = 0;
    const forbidden = politeHttp({ baseUrl: "", minIntervalMs: 0, sleep: async () => {}, fetchImpl: async () => { calls++; return { ok: false, status: 403 }; } });
    await expect(forbidden.getJson("/y")).rejects.toBeInstanceOf(ProviderError);
    expect(calls).toBe(1);
  });
});

describe("Namen nur als Vorschlag", () => {
  it("normalisiert und findet auch „Nachname Vorname“, gleiche Namen bleiben mehrdeutig", () => {
    const people = [{ name: "Lena Muster" }, { name: "Lena Muster" }, { name: "Mia Beispiel" }];
    expect(normalizeName("  Müller-Lüdenscheidt ")).toBe("muller ludenscheidt");
    expect(nameCandidates("Beispiel Mia", people)).toEqual([{ name: "Mia Beispiel" }]);
    expect(nameCandidates("Lena Muster", people)).toHaveLength(2);
    expect(nameCandidates("", people)).toEqual([]);
  });
});

describe("Vertrag", () => {
  it("Provider meldet Schema-Version", () => {
    expect(createBasketballBundProvider({ http: politeHttp({ baseUrl: "" }) }).schemaVersion).toBe(SCHEMA_VERSION);
  });
});
