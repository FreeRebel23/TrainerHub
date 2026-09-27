// TrainerHub-Adapter der Capability packages/sports-data: schreibt normalisierte Objekte
// (packages/sports-data/src/model.js) idempotent nach PocketBase, je Abteilung. Der Provider wird
// injiziert; dieses Modul kennt weder das Quellformat noch HTTP.
//
// Ablauf eines Laufs für eine Abteilung (section):
//   1. Entdeckung (nur mode "full"): Vereinsspiele der nächsten Wochen → für jede per team_links
//      zugeordnete Mannschaft Wettbewerb + Teilnahme anlegen (über stabile IDs, nie über Namen).
//      Nicht zugeordnete Mannschaften des Vereins werden nur gemeldet, nicht importiert.
//   2. Je aktivem Wettbewerb der laufenden Saison: Spielplan → eigene Spiele upserten
//      (provider+externalId), fehlende Spiele zählen statt löschen; offizielle Tabelle.
//   3. Spieldetails (Viertel, Halle) für beendete Spiele ohne Viertel und anstehende ohne Halle.
//   4. Spielerwerte (Basketball) für beendete Spiele – nur eigene Teams, nur wenn geliefert.
//   Fehler eines Schritts/Wettbewerbs werden protokolliert; vorhandene Daten bleiben unverändert.
//
// Datenhoheit: Der Sync schreibt ausschließlich Provider-Felder (Datum, Gegner, Ergebnis, Tabelle,
// offizielle Werte). Trainings-, Beobachtungs- und sonstige TrainerHub-Daten fasst er nie an.

import { esc } from "./store.js";

export const MISSING_THRESHOLD = 3;       // ab so vielen Läufen ohne das Spiel gilt es als entfernt
const DETAIL_WINDOW_DAYS = 14;            // Halle für anstehende Spiele nachladen
const RETRY_WINDOW_DAYS = 7;              // Viertel/Statistik nach Spielende so lange nachfragen
const STATS_RECHECK_HOURS = 6;

// Kalendertag in Europe/Berlin (Spiele sind lokale Termine)
export function berlinDate(now) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
const addDays = (date, n) => { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hoursSince = (iso, now) => (iso ? (now.getTime() - Date.parse(iso)) / 3.6e6 : Infinity);

const GAME_FIELDS = ["competition", "homeTeam", "awayTeam", "matchNo", "matchDay", "date", "time", "homeTeamName",
  "awayTeamName", "homeTeamExternalId", "awayTeamExternalId", "homeScore", "awayScore", "status", "forfeit", "resultConfirmed"];
const STAT_FIELDS = ["points", "twoPointersMade", "threePointersMade", "freeThrowsMade", "freeThrowAttempts", "fouls"];

// PocketBase speichert leere Zahlen als 0, leere Relationen/Text als "" – für Vergleiche angleichen
const norm = v => (v === null || v === undefined ? "" : v === 0 ? 0 : v);
const same = (a, b) => (typeof a === "number" || typeof b === "number" ? Number(a || 0) === Number(b || 0) : norm(a) === norm(b));

function diff(existing, fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) if (!existing || !same(existing[k], v)) out[k] = v;
  return out;
}

export async function syncSection({ store, provider, section, mode = "full", now = new Date(), limits = {} }) {
  const sectionId = typeof section === "string" ? section : section.id;
  const P = provider.id;
  const scope = `section = "${esc(sectionId)}" && provider = "${esc(P)}"`;
  const stamp = now.toISOString();
  const today = berlinDate(now);
  const season = provider.seasonFor(today);
  const maxDetails = limits.details ?? 25;
  const maxStats = limits.stats ?? 15;
  const requestsBefore = provider.http?.stats?.requests ?? 0;

  const summary = {
    mode, season, competitions: 0, games: { created: 0, updated: 0, unchanged: 0, rescheduled: 0, missing: 0 },
    standings: 0, details: 0, stats: { games: 0, rows: 0, unavailable: 0, relinked: 0 },
    newCompetitions: [], unmappedTeams: [], warnings: [], errors: [],
  };
  const fail = (step, e, extra = {}) => summary.errors.push({ step, ...extra, error: e?.message ?? String(e) });

  const links = await store.list("team_links", scope);
  if (!links.length) {
    summary.skipped = "keine Team-Zuordnung";
    return finish();
  }
  const linkByExt = new Map(links.map(l => [l.externalTeamId, l]));
  const competitions = new Map((await store.list("competitions", scope)).map(c => [c.externalId, c]));
  const memberships = await store.list("team_competitions", scope);
  const games = new Map((await store.list("games", scope)).map(g => [g.externalId, g]));

  // 1 ─ Entdeckung
  if (mode === "full") {
    for (const clubId of [...new Set(links.map(l => l.externalClubId).filter(Boolean))]) {
      let items;
      try { items = await provider.clubMatches(clubId); } catch (e) { fail("discovery", e, { clubId }); continue; }
      for (const { competition, game } of items) {
        for (const side of [game.home, game.away]) {
          if (side.clubId !== clubId) continue;
          const link = linkByExt.get(side.externalId);
          if (!link) {
            if (!summary.unmappedTeams.some(u => u.externalTeamId === side.externalId && u.competition === competition.externalId))
              summary.unmappedTeams.push({ externalTeamId: side.externalId, name: side.name, competition: competition.externalId, competitionName: competition.name });
            continue;
          }
          try {
            const comp = await ensureCompetition(competition);
            await ensureMembership(link, comp, side.seasonTeamId);
          } catch (e) { fail("discovery", e, { competition: competition.externalId }); }
        }
      }
    }
  }

  // 2 ─ Spielpläne, Ergebnisse, Tabellen
  let targets = [...new Set(memberships.filter(m => m.active).map(m => m.competition))]
    .map(id => [...competitions.values()].find(c => c.id === id))
    .filter(c => c && (!c.season || c.season === season));
  if (mode === "gameday") {
    const window = new Set([addDays(today, -1), today]);
    const active = new Set([...games.values()].filter(g => window.has(g.date) && g.status !== "cancelled").map(g => g.competition));
    targets = targets.filter(c => active.has(c.id));
    if (!targets.length) summary.skipped = "kein Spieltag";
  }
  const touched = new Set();   // in diesem Lauf verändert (Datum/Zeit/Ergebnis)
  const synced = new Set();

  for (const comp of targets) {
    try {
      const sched = await provider.schedule(comp.externalId);
      summary.competitions++;
      synced.add(comp.id);
      if (sched.competition) await updateCompetition(comp, sched.competition);
      const seen = new Set();
      for (const g of sched.games) {
        const homeLink = linkByExt.get(g.home.externalId);
        const awayLink = linkByExt.get(g.away.externalId);
        if (!homeLink && !awayLink) continue;              // nur Spiele eigener Teams
        if (!g.date) { summary.warnings.push({ game: g.externalId, warning: "Spiel ohne Datum übersprungen" }); continue; }
        seen.add(g.externalId);
        await upsertGame(comp, g, homeLink, awayLink);
      }
      for (const g of games.values()) {
        if (g.competition !== comp.id || seen.has(g.externalId)) continue;
        const missingCount = (g.missingCount || 0) + 1;
        Object.assign(g, await store.update("games", g.id, { missingCount }));
        summary.games.missing++;
      }
      if (comp.hasStandings !== false) {
        try { await upsertStandings(comp, await provider.standings(comp.externalId)); }
        catch (e) { fail("standings", e, { competition: comp.externalId }); }
      }
    } catch (e) { fail("schedule", e, { competition: comp.externalId }); }
  }

  // 3 ─ Spieldetails (Viertel, Halle)
  const own = [...games.values()].filter(g => synced.has(g.competition) && (g.missingCount || 0) < MISSING_THRESHOLD);
  const detailCandidates = own.filter(g => {
    const periods = Array.isArray(g.periods) && g.periods.length > 0;
    if (g.status === "finished") return !periods && (!g.detailsSyncedAt || g.date >= addDays(today, -RETRY_WINDOW_DAYS));
    if (g.status === "planned") return g.date >= today && g.date <= addDays(today, DETAIL_WINDOW_DAYS) && (!g.venue || touched.has(g.id));
    return false;
  }).sort((a, b) => a.date.localeCompare(b.date)).slice(0, maxDetails);
  for (const g of detailCandidates) {
    try {
      const d = await provider.gameDetails(g.externalId);
      const patch = { detailsSyncedAt: stamp };
      if (d.periods && g.status === "finished") patch.periods = d.periods;
      if (d.venue) Object.assign(patch, { venue: d.venue.name, venueExternalId: d.venue.externalId, venueAddress: d.venue.address });
      Object.assign(g, await store.update("games", g.id, patch));
      summary.details++;
    } catch (e) { fail("details", e, { game: g.externalId }); }
  }

  // 4 ─ Spielerwerte (Basketball)
  if (provider.boxscore) {
    const playerLinks = new Map((await store.list("player_links", scope)).map(l => [l.externalPlayerId, l.player]));
    const statCandidates = own.filter(g => g.status === "finished" && !g.forfeit &&
      (!g.statsCheckedAt || (g.date >= addDays(today, -RETRY_WINDOW_DAYS) && hoursSince(g.statsCheckedAt, now) >= STATS_RECHECK_HOURS)))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, maxStats);
    for (const g of statCandidates) {
      try {
        const box = await provider.boxscore(g.externalId);
        const existing = new Map((await store.list("basketball_player_game_stats", `game = "${esc(g.id)}"`)).map(r => [r.externalPlayerId, r]));
        let any = false;
        for (const [team, side] of [[g.homeTeam, box.home], [g.awayTeam, box.away]]) {
          if (!team) continue;                                   // Gegner: keine Personendaten speichern
          if (!side.available) continue;
          any = true;
          for (const p of side.players) {
            const fields = { section: sectionId, game: g.id, team, player: playerLinks.get(p.externalPlayerId) ?? "", provider: P,
              externalPlayerId: p.externalPlayerId, jerseyNumber: p.jerseyNumber, externalName: p.name };
            for (const k of STAT_FIELDS) fields[k] = p[k] ?? 0;
            const row = existing.get(p.externalPlayerId);
            const changes = diff(row, fields);
            if (!row) await store.create("basketball_player_game_stats", { ...fields, lastSyncedAt: stamp });
            else if (Object.keys(changes).length) await store.update("basketball_player_game_stats", row.id, { ...changes, lastSyncedAt: stamp });
            summary.stats.rows++;
          }
        }
        if (any) summary.stats.games++; else summary.stats.unavailable++;
        Object.assign(g, await store.update("games", g.id, { statsCheckedAt: stamp }));
      } catch (e) { fail("stats", e, { game: g.externalId }); }
    }
    // Nachträglich bestätigte Zuordnungen auf vorhandene Zeilen übertragen
    for (const row of await store.list("basketball_player_game_stats", `section = "${esc(sectionId)}" && provider = "${esc(P)}" && player = ""`)) {
      const player = playerLinks.get(row.externalPlayerId);
      if (player) { await store.update("basketball_player_game_stats", row.id, { player }); summary.stats.relinked++; }
    }
  }

  return finish();

  // ── Hilfsfunktionen ────────────────────────────────────────────────────────────────
  async function ensureCompetition(c) {
    let comp = competitions.get(c.externalId);
    if (!comp) {
      comp = await store.create("competitions", { section: sectionId, ...c, lastSeenAt: stamp, lastSyncedAt: stamp });
      competitions.set(c.externalId, comp);
      summary.newCompetitions.push({ externalId: c.externalId, name: c.name });
    }
    return comp;
  }

  async function updateCompetition(comp, c) {
    const changes = diff(comp, { name: c.name, season: c.season, seasonName: c.seasonName, level: c.level, ageGroup: c.ageGroup,
      gender: c.gender, association: c.association, district: c.district, hasStandings: c.hasStandings });
    Object.assign(comp, await store.update("competitions", comp.id, { ...changes, lastSeenAt: stamp, lastSyncedAt: stamp }));
  }

  async function ensureMembership(link, comp, externalTeamId) {
    const m = memberships.find(x => x.team === link.team && x.competition === comp.id);
    if (!m) {
      memberships.push(await store.create("team_competitions", { section: sectionId, team: link.team, competition: comp.id,
        provider: P, externalTeamId, active: true, lastSeenAt: stamp, lastSyncedAt: stamp }));
    } else if (m.externalTeamId !== externalTeamId) {
      Object.assign(m, await store.update("team_competitions", m.id, { externalTeamId, lastSeenAt: stamp }));
    }
  }

  async function upsertGame(comp, g, homeLink, awayLink) {
    const fields = {
      competition: comp.id, homeTeam: homeLink?.team ?? "", awayTeam: awayLink?.team ?? "",
      matchNo: g.matchNo, matchDay: g.matchDay ?? 0, date: g.date, time: g.time,
      homeTeamName: g.home.name, awayTeamName: g.away.name, homeTeamExternalId: g.home.externalId, awayTeamExternalId: g.away.externalId,
      homeScore: g.homeScore ?? 0, awayScore: g.awayScore ?? 0, status: g.status, forfeit: g.forfeit, resultConfirmed: g.resultConfirmed,
    };
    const existing = games.get(g.externalId);
    if (!existing) {
      const rec = await store.create("games", { section: sectionId, provider: P, externalId: g.externalId, ...fields,
        missingCount: 0, lastSeenAt: stamp, lastSyncedAt: stamp });
      games.set(g.externalId, rec);
      touched.add(rec.id);
      summary.games.created++;
      return;
    }
    const changes = diff(existing, Object.fromEntries(GAME_FIELDS.map(k => [k, fields[k]])));
    const patch = { ...changes, lastSeenAt: stamp };
    if (existing.missingCount) patch.missingCount = 0;
    if (Object.keys(changes).length) {
      patch.lastSyncedAt = stamp;
      if ("date" in changes && existing.date) { patch.previousDate = existing.date; summary.games.rescheduled++; }
      // Neues/anderes Ergebnis: Viertel und Statistik neu holen
      if ("homeScore" in changes || "awayScore" in changes || "status" in changes) { patch.detailsSyncedAt = ""; patch.statsCheckedAt = ""; patch.periods = null; }
      touched.add(existing.id);
      summary.games.updated++;
    } else summary.games.unchanged++;
    games.set(g.externalId, Object.assign(existing, await store.update("games", existing.id, patch)));
  }

  async function upsertStandings(comp, { entries }) {
    if (!entries) return;
    const [existing] = await store.list("standings", `competition = "${esc(comp.id)}"`);
    if (!existing) await store.create("standings", { section: sectionId, competition: comp.id, provider: P, entries, fetchedAt: stamp });
    else if (JSON.stringify(existing.entries) !== JSON.stringify(entries)) await store.update("standings", existing.id, { entries, fetchedAt: stamp });
    else await store.update("standings", existing.id, { fetchedAt: stamp });
    summary.standings++;
  }

  async function finish() {
    summary.requests = (provider.http?.stats?.requests ?? 0) - requestsBefore;
    const status = summary.errors.length ? (summary.competitions || summary.details || summary.stats.games ? "partial" : "error") : "ok";
    const run = await store.create("sync_runs", { section: sectionId, provider: P, mode, startedAt: stamp, finishedAt: new Date().toISOString(),
      status, summary, error: summary.errors.map(e => `${e.step}: ${e.error}`).join("\n").slice(0, 5000) });
    return { status, summary, run };
  }
}

// Alle Abteilungen mit Team-Zuordnungen nacheinander (kein Import ohne Zuordnung)
export async function syncAll({ store, provider, mode = "full", now = new Date(), limits }) {
  const links = await store.list("team_links", `provider = "${esc(provider.id)}"`);
  const results = [];
  for (const section of [...new Set(links.map(l => l.section))]) {
    results.push({ section, ...(await syncSection({ store, provider, section, mode, now, limits })) });
  }
  return results;
}
