// Synthetische „Verbandswelt“ für Tests: liefert dieselbe JSON-Struktur wie basketball-bund.net
// /rest/… (Struktur verifiziert am 27.09.2026, siehe docs/SPORTS_DATA_ARCHITECTURE.md), aber mit
// frei erfundenen Vereinen, Mannschaften und Personen. Kein Netzwerkzugriff.

const envelope = (data, status = "0", message = "") => ({ timestamp: "2026-09-27T09:30:00+0200", status, message, data });

export function createWorld({ today = "2026-09-27" } = {}) {
  const leagues = new Map();     // ligaId → { ligaData, matchIds: [], table }
  const matches = new Map();     // matchId → match
  const details = new Map();     // matchId → { matchResult, spielfeld, box }
  const world = {
    today, requests: [], down: false, failPaths: new Set(),

    league(ligaId, { name, season = 2026, tableExists = true } = {}) {
      const ligaData = { seasonId: season, seasonName: `${season}/${season + 1}`, ligaId, liganame: name + " ", liganr: 70000 + ligaId,
        skName: "Bezirksliga", akName: "U16", geschlechtId: 2, geschlecht: "weiblich", verbandId: 1, verbandName: "Baden-Württemberg",
        bezirknr: 2, bezirkName: "Testbezirk", statisticType: 1, vorabliga: false, tableExists, crossTableExists: tableExists };
      leagues.set(ligaId, { ligaData, matchIds: [], table: null });
      return ligaData;
    },

    team(teamPermanentId, seasonTeamId, clubId, teamname) {
      return { seasonTeamId, teamCompetitionId: seasonTeamId, teamPermanentId, teamname, teamnameSmall: teamname.slice(0, 4), clubId, verzicht: false };
    },

    match({ ligaId, matchId, matchNo = matchId % 100000, matchDay = 1, date, time = "15:00", home, guest, result = null,
      abgesagt = false, verzicht = false, confirmed = false }) {
      const m = { ligaData: null, matchId, matchDay, matchNo, kickoffDate: date, kickoffTime: time, homeTeam: home, guestTeam: guest,
        result, ergebnisbestaetigt: confirmed, statisticType: null, verzicht, abgesagt, matchResult: null, matchInfo: null,
        matchBoxscore: null, playByPlay: null, hasPlayByPlay: null };
      matches.set(matchId, m);
      if (!leagues.get(ligaId).matchIds.includes(matchId)) leagues.get(ligaId).matchIds.push(matchId);
      m._liga = ligaId;
      return m;
    },
    update(matchId, patch) { Object.assign(matches.get(matchId), patch); },
    remove(matchId) {
      const m = matches.get(matchId);
      const l = leagues.get(m._liga);
      l.matchIds = l.matchIds.filter(id => id !== matchId);
      matches.delete(matchId);
    },

    // Viertel als Einzelwerte je Abschnitt (wie die echte Quelle), optional Verlängerungen
    quarters(matchId, home, away) {
      const r = { heimEndstand: home.reduce((a, b) => a + b, 0), gastEndstand: away.reduce((a, b) => a + b, 0) };
      const keys = ["V1", "Halbzeit", "V3", "V4", "Ot1", "Ot2"];
      keys.forEach((k, i) => { r[`heim${k}stand`] = home[i] ?? null; r[`gast${k}stand`] = away[i] ?? null; });
      details.set(matchId, { ...(details.get(matchId) ?? {}), matchResult: r });
    },
    venue(matchId, spielfeld) { details.set(matchId, { ...(details.get(matchId) ?? {}), spielfeld }); },
    // players: [{ id, first, last, no, pts, two, three, ftm, fta, fouls, anonym }]
    boxscore(matchId, { home = [], guest = [] }) { details.set(matchId, { ...(details.get(matchId) ?? {}), box: { home, guest } }); },

    table(ligaId, rows) {
      leagues.get(ligaId).table = rows.map((r, i) => ({ rang: i + 1, team: r.team, anzspiele: r.games, anzGewinnpunkte: r.points,
        anzVerlustpunkte: r.pointsAgainst ?? 0, s: r.wins, n: r.losses, koerbe: r.scored, gegenKoerbe: r.conceded, korbdiff: r.scored - r.conceded }));
    },

    fetch: async (url) => {
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      world.requests.push(path);
      if (world.down) throw new TypeError("fetch failed");
      if ([...world.failPaths].some(p => path.includes(p))) return response(503, { error: "unavailable" });
      return response(200, route(path));
    },
  };

  const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const withLiga = m => ({ ...strip(m), ligaData: leagues.get(m._liga).ligaData });
  const strip = m => { const { _liga, ...rest } = m; return rest; };

  function player(p) {
    const person = p.anonym ? { id: 0, vorname: "***", nachname: "***", anonym: true } : { id: p.id, vorname: p.first, nachname: p.last, anonym: false };
    const pair = (made, attempted = made) => ({ made: made ?? 0, attempted: attempted ?? 0, quota: null });
    return { esz: 0, pts: p.pts ?? 0, twoPoints: pair(p.two), threePoints: pair(p.three), wt: pair(p.ftm, p.fta), onePoints: pair(0),
      ro: 0, rd: 0, rt: 0, as: 0, st: 0, to: 0, bs: 0, fouls: p.fouls ?? 0, eff: 0, player: { playerId: 700000 + (p.id || 0), no: String(p.no ?? ""), person, anonym: !!p.anonym }, isf: null };
  }

  function route(path) {
    let m;
    if ((m = /^\/rest\/club\/id\/(\d+)\/actualmatches\?.*rangeDays=(\d+)/.exec(path))) {
      const club = Number(m[1]);
      const until = new Date(world.today + "T12:00:00Z"); until.setUTCDate(until.getUTCDate() + Number(m[2]));
      const from = new Date(world.today + "T12:00:00Z"); from.setUTCDate(from.getUTCDate() - 1);
      const list = [...matches.values()].filter(x => (x.homeTeam?.clubId === club || x.guestTeam?.clubId === club) &&
        x.kickoffDate >= from.toISOString().slice(0, 10) && x.kickoffDate <= until.toISOString().slice(0, 10));
      return envelope({ club: { vereinId: club, vereinsname: "Testverein", vereinsnummer: "0000000", kontaktData: null }, matches: list.map(withLiga) });
    }
    if ((m = /^\/rest\/competition\/(spielplan|table|actual)\/id\/(\d+)$/.exec(path))) {
      const l = leagues.get(Number(m[2]));
      if (!l) return envelope(null, "1", `no competition found with id ${m[2]}`);
      const base = { prevSpieltag: null, selSpieltag: null, selSpielDatum: null, nextSpieltag: null, ligaData: l.ligaData,
        spieltage: null, matches: [], tabelle: null, kreuztabelle: null, teamStatistik: null };
      if (m[1] === "spielplan") base.matches = l.matchIds.map(id => ({ ...strip(matches.get(id)) }));
      if (m[1] === "table") base.tabelle = { ligaData: null, entries: l.table ?? [], bbl: false };
      return envelope(base);
    }
    if ((m = /^\/rest\/match\/id\/(\d+)\/(matchInfo|boxscore)$/.exec(path))) {
      const id = Number(m[1]);
      const x = matches.get(id);
      if (!x) return envelope(null, "1", `no match found with id ${id}`);
      const d = details.get(id) ?? {};
      const out = { ...withLiga(x), statisticType: 1, matchResult: d.matchResult ?? null };
      if (m[2] === "matchInfo") out.matchInfo = { topPerformances: [], spielfeld: d.spielfeld ?? null, srList: [] };
      else out.matchBoxscore = { homePlayerStats: (d.box?.home ?? []).map(player), homeTeamStats: null, homeTotalStats: null,
        guestPlayerStats: (d.box?.guest ?? []).map(player), guestTeamStats: null, guestTotalStats: null };
      return envelope(out);
    }
    return envelope(null, "1", "unknown path");
  }

  return world;
}
