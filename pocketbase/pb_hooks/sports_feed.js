// Öffentlicher Lese-Feed für angeschlossene Dienste (GameDay, Scoreboard) – Vertrag v1.
// Liefert nur Spiele/Tabellen von Teams, deren team_links.publish = true ist, und nur Felder,
// die ohnehin öffentlich beim Verband stehen. Keine Spieler:innen, keine Trainingsdaten, keine
// Team-/Spielerobjekte. Siehe docs/SPORTS_DATA_ARCHITECTURE.md, Abschnitt „GameDay/Scoreboard“.

const ID_RE = /^[a-z0-9]{1,40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MISSING_THRESHOLD = 3;   // wie server/trainerhub-sports/sync.js

function isoDay(offset) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function param(e, name) {
  return String(e.request.url.query().get(name) || "");
}

function sectionParam(e) {
  const section = param(e, "section");
  if (!ID_RE.test(section)) throw new BadRequestError("Parameter section fehlt oder ist ungültig.");
  return section;
}

function parseJson(record, field) {
  try { return JSON.parse(record.getString(field) || "null"); } catch (_) { return null; }
}

// Veröffentlichte Teams einer Abteilung: team-ID → Anzeigename
function publishedTeams(section) {
  const out = {};
  const links = $app.findRecordsByFilter("team_links", "section = {:section} && publish = true", "", 0, 0, { section });
  for (const l of links) {
    const team = $app.findRecordById("teams", l.getString("team"));
    out[team.id] = team.getString("name");
  }
  return out;
}

function competitionInfo(cache, id) {
  if (!cache[id]) {
    const c = $app.findRecordById("competitions", id);
    cache[id] = { id: c.id, name: c.getString("name"), externalId: c.getString("externalId"), season: c.getString("seasonName") };
  }
  return cache[id];
}

function side(g, prefix, teams, finished) {
  const teamId = g.getString(prefix + "Team");
  return {
    name: g.getString(prefix + "TeamName"),
    score: finished ? g.getInt(prefix + "Score") : null,
    team: teams[teamId] !== undefined ? { id: teamId, name: teams[teamId] } : null,
  };
}

function games(e) {
  const section = sectionParam(e);
  const from = param(e, "from") || isoDay(-14);
  const to = param(e, "to") || isoDay(60);
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) throw new BadRequestError("from/to müssen YYYY-MM-DD sein.");
  const teams = publishedTeams(section);
  const ids = Object.keys(teams);
  const out = [];
  if (ids.length) {
    const records = $app.findRecordsByFilter("games",
      "section = {:section} && date >= {:from} && date <= {:to} && missingCount < {:missing}",
      "date,time", 1000, 0, { section, from, to, missing: MISSING_THRESHOLD });
    const comps = {};
    for (const g of records) {
      if (!teams[g.getString("homeTeam")] && !teams[g.getString("awayTeam")]) continue;
      const finished = g.getString("status") === "finished";
      const venue = g.getString("venue");
      out.push({
        id: g.id, provider: g.getString("provider"), externalId: g.getString("externalId"),
        competition: competitionInfo(comps, g.getString("competition")),
        date: g.getString("date"), time: g.getString("time") || null, previousDate: g.getString("previousDate") || null,
        status: g.getString("status"), forfeit: g.getBool("forfeit"), resultConfirmed: g.getBool("resultConfirmed"),
        home: side(g, "home", teams, finished), away: side(g, "away", teams, finished),
        periods: finished ? parseJson(g, "periods") : null,
        venue: venue ? { name: venue, address: g.getString("venueAddress") || null } : null,
        lastSyncedAt: g.getString("lastSyncedAt") || null,
      });
    }
  }
  e.response.header().set("Cache-Control", "public, max-age=120");
  return e.json(200, { version: 1, section, from, to, games: out });
}

function standings(e) {
  const section = sectionParam(e);
  const teams = publishedTeams(section);
  const out = [];
  const seen = {};
  for (const teamId of Object.keys(teams)) {
    const memberships = $app.findRecordsByFilter("team_competitions", "team = {:team} && active = true", "", 0, 0, { team: teamId });
    for (const m of memberships) {
      const compId = m.getString("competition");
      if (seen[compId]) continue;
      seen[compId] = true;
      let s;
      try { s = $app.findFirstRecordByFilter("standings", "competition = {:c}", { c: compId }); } catch (_) { continue; }
      const c = $app.findRecordById("competitions", compId);
      out.push({
        competition: { id: c.id, name: c.getString("name"), externalId: c.getString("externalId"), season: c.getString("seasonName") },
        team: { id: teamId, name: teams[teamId], externalId: m.getString("externalTeamId") },
        entries: parseJson(s, "entries") || [],
        fetchedAt: s.getString("fetchedAt") || null,
      });
    }
  }
  e.response.header().set("Cache-Control", "public, max-age=300");
  return e.json(200, { version: 1, section, standings: out });
}

module.exports = { games, standings };
