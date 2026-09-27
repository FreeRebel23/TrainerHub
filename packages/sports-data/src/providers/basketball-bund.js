// Provider-Adapter basketball-bund.net (TeamSL) – Teil der produktneutralen Capability
// packages/sports-data. Einzige Stelle, die das Format der Quelle kennt. Liefert normalisierte
// Domänenobjekte (Vertrag: ../model.js); Speicherung, Mapping auf eigene Teams und Darstellung
// sind Sache der Verbraucher (TrainerHub → PocketBase, GameDay → Rendering/Publishing).
// Keine Abhängigkeiten außer Node-Bordmitteln und Modulen dieses Pakets.
//
// Verwendet ausschließlich die öffentliche JSON-Schnittstelle /rest/…, die auch die Webseite selbst
// nutzt und die robots.txt nicht ausschließt. Die HTML-Ergebnisseiten index.jsp?Action=103/106,
// das Archiv und statistik.do?reqCode=statTeam sind per robots.txt gesperrt und werden nicht
// verwendet. Details und verifizierte Beispiele: packages/sports-data/README.md.
//
// Stabile IDs der Quelle → Feld im normalisierten Objekt
//   ligaId            Wettbewerb einer Saison               → Competition.externalId
//   matchId           Spiel (global eindeutig)               → Game.externalId
//   matchNo           Spielnummer (nur je Liga eindeutig)    → Game.matchNo (Anzeige/Abgleich)
//   teamPermanentId   Mannschaft, wettbewerbsübergreifend    → TeamRef.externalId
//   seasonTeamId      Mannschaft in genau einem Wettbewerb   → TeamRef.seasonTeamId
//   clubId            Verein                                 → TeamRef.clubId
//   person.id         Person (Spieler:in)                    → PlayerGameStat.externalPlayerId
//   spielfeld.id      Halle                                  → Venue.externalId

import { ProviderError, politeHttp } from "../http.js";
import { SCHEMA_VERSION } from "../model.js";

export const PROVIDER = "basketball-bund";
export const BASE_URL = "https://www.basketball-bund.net";

const str = v => (v === null || v === undefined ? "" : String(v));
const trim = v => str(v).replace(/\s+/g, " ").trim();
const int = v => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

function unwrap(body, path) {
  if (!body || typeof body !== "object") throw new ProviderError("Leere Antwort", { url: path });
  if (String(body.status) !== "0") {
    const msg = trim(body.message) || `Status ${body.status}`;
    throw new ProviderError(msg, { url: path, notFound: /not found|no .* found/i.test(msg) });
  }
  return body.data ?? null;
}

export function normalizeCompetition(liga) {
  if (!liga || liga.ligaId === undefined || liga.ligaId === null) return null;
  return {
    provider: PROVIDER,
    externalId: str(liga.ligaId),
    name: trim(liga.liganame),
    season: str(liga.seasonId),
    seasonName: trim(liga.seasonName),
    level: trim(liga.skName),
    ageGroup: trim(liga.akName),
    gender: trim(liga.geschlecht),
    association: trim(liga.verbandName),
    district: trim(liga.bezirkName),
    hasStandings: liga.tableExists !== false,
  };
}

function normalizeTeam(t) {
  if (!t) return null;
  return {
    externalId: str(t.teamPermanentId),
    seasonTeamId: str(t.seasonTeamId),
    clubId: str(t.clubId),
    name: trim(t.teamname),
    withdrawn: !!t.verzicht,
  };
}

export function parseScore(result) {
  const m = /^\s*(\d+)\s*:\s*(\d+)\s*$/.exec(str(result));
  return m ? { home: Number(m[1]), away: Number(m[2]) } : null;
}

// Zeit 00:00 bedeutet in der Quelle „noch nicht angesetzt“, nicht Mitternacht
function normalizeTime(t) {
  const m = /^(\d{2}):(\d{2})/.exec(str(t));
  if (!m || (m[1] === "00" && m[2] === "00")) return "";
  return `${m[1]}:${m[2]}`;
}

export function normalizeMatch(m, liga = m?.ligaData) {
  if (!m || m.matchId === undefined || m.matchId === null) return null;
  const home = normalizeTeam(m.homeTeam);
  const away = normalizeTeam(m.guestTeam);
  if (!home || !away) return null;   // spielfrei / Freilos: kein Spiel
  const score = parseScore(m.result);
  // Status nur aus dem, was die Quelle liefert: abgesagt → cancelled, Ergebnis → finished.
  // Eine „verlegt“-Kennzeichnung liefert die JSON-Quelle nicht; Verlegungen erkennt der Verbraucher an
  // einem geänderten Datum desselben Spiels.
  const status = m.abgesagt ? "cancelled" : score ? "finished" : "planned";
  return {
    provider: PROVIDER,
    externalId: str(m.matchId),
    competitionExternalId: liga ? str(liga.ligaId) : "",
    matchNo: str(m.matchNo),
    matchDay: int(m.matchDay),
    date: /^\d{4}-\d{2}-\d{2}$/.test(str(m.kickoffDate)) ? m.kickoffDate : "",
    time: normalizeTime(m.kickoffTime),
    home, away,
    homeScore: score ? score.home : null,
    awayScore: score ? score.away : null,
    status,
    forfeit: !!m.verzicht,
    resultConfirmed: !!m.ergebnisbestaetigt,
  };
}

// Viertel/Verlängerungen. Verifiziert (Spiel 2946251): heimV1stand, heimHalbzeitstand(!),
// heimV3stand, heimV4stand sind die Punkte JE Viertel (13+13+17+22 = 65), nicht kumuliert –
// „Halbzeitstand“ ist trotz des Namens das 2. Viertel. Zur Sicherheit wird geprüft: Summe = Endstand
// → Einzelwerte; streng kumulativ mit letztem Wert = Endstand → Differenzen; sonst keine Abschnitte.
export function normalizePeriods(r) {
  if (!r) return null;
  const pairs = [
    ["Q1", r.heimV1stand, r.gastV1stand], ["Q2", r.heimHalbzeitstand, r.gastHalbzeitstand],
    ["Q3", r.heimV3stand, r.gastV3stand], ["Q4", r.heimV4stand, r.gastV4stand],
    ["OT1", r.heimOt1stand, r.gastOt1stand], ["OT2", r.heimOt2stand, r.gastOt2stand],
  ].filter(([, h, a]) => int(h) !== null && int(a) !== null).map(([label, h, a]) => ({ label, home: int(h), away: int(a) }));
  const fh = int(r.heimEndstand), fa = int(r.gastEndstand);
  if (pairs.length < 4 || fh === null || fa === null) return null;
  const sum = side => pairs.reduce((s, p) => s + p[side], 0);
  if (sum("home") === fh && sum("away") === fa) return pairs;
  const last = pairs[pairs.length - 1];
  const monotonic = pairs.every((p, i) => i === 0 || (p.home >= pairs[i - 1].home && p.away >= pairs[i - 1].away));
  if (monotonic && last.home === fh && last.away === fa) {
    return pairs.map((p, i) => ({ label: p.label, home: p.home - (i ? pairs[i - 1].home : 0), away: p.away - (i ? pairs[i - 1].away : 0) }));
  }
  return null;
}

export function normalizeVenue(info) {
  const f = info?.spielfeld;
  if (!f || !trim(f.bezeichnung)) return null;
  const address = [trim(f.strasse), [trim(f.plz), trim(f.ort)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return { externalId: str(f.id), name: trim(f.bezeichnung), address };
}

export function normalizeStandings(tabelle) {
  const entries = tabelle?.entries;
  if (!Array.isArray(entries) || !entries.length) return null;
  return entries.map(e => ({
    rank: int(e.rang),
    teamExternalId: str(e.team?.teamPermanentId),
    seasonTeamId: str(e.team?.seasonTeamId),
    clubId: str(e.team?.clubId),
    teamName: trim(e.team?.teamname),
    games: int(e.anzspiele),
    wins: int(e.s),
    losses: int(e.n),
    points: int(e.anzGewinnpunkte),
    pointsAgainst: int(e.anzVerlustpunkte),
    scored: int(e.koerbe),
    conceded: int(e.gegenKoerbe),
    difference: int(e.korbdiff),
    withdrawn: !!e.team?.verzicht,
  }));
}

// Boxscore einer Mannschaft. Nur Werte, die die Quelle liefert (Vertrag: PlayerGameStat).
// Liefert die Quelle für die Mannschaft ausschließlich Nullen (typisch, solange kein Statistikbogen
// erfasst ist), gilt das als „keine Statistik“ – es werden keine Schein-Nullen gespeichert.
export function normalizeBoxscoreSide(list) {
  if (!Array.isArray(list)) return { available: false, players: [], anonymous: 0 };
  let anonymous = 0;
  const players = [];
  for (const s of list) {
    const person = s?.player?.person;
    if (!person || person.anonym || s.player?.anonym || !person.id) { anonymous++; continue; }
    players.push({
      externalPlayerId: str(person.id),
      jerseyNumber: trim(s.player?.no),
      name: trim(`${str(person.vorname)} ${str(person.nachname)}`),
      points: int(s.pts),
      twoPointersMade: int(s.twoPoints?.made),
      threePointersMade: int(s.threePoints?.made),
      freeThrowsMade: int(s.wt?.made),
      freeThrowAttempts: int(s.wt?.attempted),
      fouls: int(s.fouls),
    });
  }
  const keys = ["points", "twoPointersMade", "threePointersMade", "freeThrowsMade", "freeThrowAttempts", "fouls"];
  const available = players.some(p => keys.some(k => p[k]));
  return { available, players: available ? players : [], anonymous };
}

export function createBasketballBundProvider({ http = politeHttp({ baseUrl: BASE_URL }) } = {}) {
  const get = async path => unwrap(await http.getJson(path), path);
  return {
    id: PROVIDER,
    schemaVersion: SCHEMA_VERSION,
    http,

    // Saison-ID der Quelle für einen Kalendertag: Saison beginnt am 1. Juli (2026-09-27 → "2026" = 2026/2027)
    seasonFor(date) {
      const [y, m] = String(date).split("-").map(Number);
      return String(m >= 7 ? y : y - 1);
    },

    // Spiele eines Vereins im nahen Zeitraum (Quelle begrenzt auf ca. drei Wochen) – zeigt, in
    // welchen Wettbewerben die Mannschaften eines Vereins gerade spielen.
    async clubMatches(clubId, { rangeDays = 21 } = {}) {
      const data = await get(`/rest/club/id/${encodeURIComponent(clubId)}/actualmatches?justHome=false&rangeDays=${rangeDays}`);
      return (data?.matches ?? []).map(m => ({ competition: normalizeCompetition(m.ligaData), game: normalizeMatch(m) }))
        .filter(x => x.competition && x.game);
    },

    // Kompletter Spielplan inkl. Endständen eines Wettbewerbs
    async schedule(competitionId) {
      const data = await get(`/rest/competition/spielplan/id/${encodeURIComponent(competitionId)}`);
      const competition = normalizeCompetition(data?.ligaData);
      return { competition, games: (data?.matches ?? []).map(m => normalizeMatch(m, data?.ligaData)).filter(Boolean) };
    },

    async standings(competitionId) {
      const data = await get(`/rest/competition/table/id/${encodeURIComponent(competitionId)}`);
      return { competition: normalizeCompetition(data?.ligaData), entries: normalizeStandings(data?.tabelle) };
    },

    // Spieldetails: Viertel, Halle
    async gameDetails(gameId) {
      const data = await get(`/rest/match/id/${encodeURIComponent(gameId)}/matchInfo`);
      return { game: normalizeMatch(data), periods: normalizePeriods(data?.matchResult), venue: normalizeVenue(data?.matchInfo) };
    },

    // Spielerwerte beider Mannschaften (welche Seite „eigen“ ist, entscheidet der Verbraucher)
    async boxscore(gameId) {
      const data = await get(`/rest/match/id/${encodeURIComponent(gameId)}/boxscore`);
      const b = data?.matchBoxscore;
      return {
        game: normalizeMatch(data),
        home: normalizeBoxscoreSide(b?.homePlayerStats),
        away: normalizeBoxscoreSide(b?.guestPlayerStats),
      };
    },
  };
}
