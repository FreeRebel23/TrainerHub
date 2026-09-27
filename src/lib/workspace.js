// Phase 4 – Fachlogik Team Workspace: Saison, Saisonkader, Beobachtungen, Spiele, „Als Nächstes“.
// Reine Funktionen ohne UI (Details: docs/PHASE4_TEAM_WORKSPACE.md).
//
//   Person (players)         = ein Mensch in der Abteilung – Name, Jahrgang, verletzt
//   Kadereintrag (rosterEntries) = diese Person gehört in Saison X zu Team Y (Nummer, Position, Status)
//   Beobachtung (observations)   = Trainernotiz zu einer Person, zugleich am Ereignis (Training/Planung/Spiel)
//
// Trainings, Planungen und Beobachtungen gehören über Team + Datum zu einer Saison (wie seit Phase 2).
// Neue Felder/Listen sind optional: ältere Datenstände werden gelesen, nicht umgeschrieben.

import { uid, isPresent, getActiveSeason } from "./data.js";
import { stableId } from "./ids.js";
import { normalizeTags, content, byDateTime } from "./training.js";

export const ROSTER_STATUS = {
  active: { label: "aktiv", tone: "success" },
  paused: { label: "pausiert", tone: "warning" },
  left:   { label: "nicht mehr im Kader", tone: "muted" },
};

const list = (data, key) => data?.[key] ?? [];

// ─── Saison ───

export function seasonsOf(teamId, data) {
  return list(data, "seasons").filter(s => s.teamId === teamId).sort((a, b) => b.startDate.localeCompare(a.startDate));
}

// Aktive Saison: nicht abgeschlossen und heute im Zeitraum; sonst die jüngste nicht abgeschlossene
// (z. B. Vorbereitung vor Saisonbeginn). Abgeschlossene Saisons sind nie aktiv.
export function activeSeason(teamId, data, today) {
  return getActiveSeason(teamId, data?.seasons, today);
}

export function isHistorical(season, today) {
  return !!season && (season.phase === "abgeschlossen" || season.endDate < today);
}

// Saison eines Tages für ein Team (Trainings/Beobachtungen haben keine eigene Saison-Referenz)
export function seasonAt(teamId, date, data) {
  return seasonsOf(teamId, data).find(s => s.startDate <= date && date <= s.endDate) ?? null;
}

export const inSeason = (season, date) => !season || (season.startDate <= date && date <= season.endDate);

// ─── Saisonkader ───

export const rosterEntryId = (seasonId, playerId) => stableId("roster", seasonId, playerId);

// Hat das Team schon Saisonkader? Sonst gilt (wie bis Phase 3) die Teamliste team.playerIds.
export function usesSeasonRoster(teamId, data) {
  return list(data, "rosterEntries").some(e => e.teamId === teamId);
}

// Kader eines Teams in einer Saison: [{ player, entry }] (entry = null bei der bisherigen Teamliste).
// statuses: welche Status zählen (Standard: alle – auch „nicht mehr im Kader“ für die Historie)
export function roster(teamId, season, data, { statuses = null } = {}) {
  const byPlayer = new Map(list(data, "players").map(p => [p.id, p]));
  let rows;
  if (usesSeasonRoster(teamId, data)) {
    rows = season
      ? list(data, "rosterEntries").filter(e => e.teamId === teamId && e.seasonId === season.id)
          .map(entry => ({ player: byPlayer.get(entry.playerId), entry }))
      : [];
  } else {
    const team = list(data, "teams").find(t => t.id === teamId);
    rows = (team?.playerIds ?? []).map(id => ({ player: byPlayer.get(id), entry: null }));
  }
  return rows
    .filter(r => r.player && (!statuses || statuses.includes(r.entry?.status || "active")))
    .sort((a, b) => a.player.name.localeCompare(b.player.name, "de"));
}

// Wer steht an einem Trainingstag im Kader? (für die Anwesenheit; nur aktive)
export function trainingRoster(teamId, date, data) {
  return roster(teamId, seasonAt(teamId, date, data) ?? activeSeason(teamId, data, date), data, { statuses: ["active"] })
    .map(r => r.player);
}

// Erster Schritt eines Teams zum Saisonkader: die bisherige Teamliste wird zum Kader dieser Saison.
function materialize(data, teamId, season) {
  if (!season || usesSeasonRoster(teamId, data)) return data;
  const team = list(data, "teams").find(t => t.id === teamId);
  const entries = (team?.playerIds ?? []).map(playerId =>
    ({ id: rosterEntryId(season.id, playerId), seasonId: season.id, teamId, playerId, status: "active" }));
  return { ...data, rosterEntries: [...list(data, "rosterEntries"), ...entries] };
}

// Person in den Kader aufnehmen (bzw. zurückholen). Ohne Saison: bisherige Teamliste.
export function addToRoster(data, { teamId, season, playerId }) {
  if (!season) {
    return { ...data, teams: list(data, "teams").map(t => t.id !== teamId ? t
      : { ...t, playerIds: [...new Set([...(t.playerIds ?? []), playerId])] }) };
  }
  const d = materialize(data, teamId, season);
  const existing = list(d, "rosterEntries").find(e => e.seasonId === season.id && e.playerId === playerId);
  if (existing) return existing.status === "active" ? d : updateRosterEntry(d, existing.id, { status: "active" });
  return { ...d, rosterEntries: [...list(d, "rosterEntries"),
    { id: rosterEntryId(season.id, playerId), seasonId: season.id, teamId, playerId, status: "active" }] };
}

// Neue Person anlegen und direkt in den Kader aufnehmen
export function createPlayer(data, { teamId, season, name, birthYear = null }) {
  const player = { id: uid(), name: name.trim(), birthYear: birthYear || null, injured: false };
  return { data: addToRoster({ ...data, players: [...list(data, "players"), player] }, { teamId, season, playerId: player.id }), player };
}

export function updateRosterEntry(data, entryId, patch) {
  return { ...data, rosterEntries: list(data, "rosterEntries").map(e => e.id === entryId ? { ...e, ...patch } : e) };
}

// Aus dem Kader nehmen: Status „nicht mehr im Kader“ – Person, Beobachtungen, Anwesenheiten und die
// Zugehörigkeit zu dieser Saison bleiben erhalten. Ohne Saisonkader: aus der Teamliste nehmen.
export function removeFromRoster(data, { teamId, season, playerId }) {
  const d = materialize(data, teamId, season);
  if (!usesSeasonRoster(teamId, d)) {
    return { ...d, teams: list(d, "teams").map(t => t.id !== teamId ? t
      : { ...t, playerIds: (t.playerIds ?? []).filter(id => id !== playerId) }) };
  }
  const e = season && list(d, "rosterEntries").find(x => x.seasonId === season.id && x.playerId === playerId);
  return e ? updateRosterEntry(d, e.id, { status: "left" }) : d;
}

export function updatePlayer(data, playerId, patch) {
  return { ...data, players: list(data, "players").map(p => p.id === playerId ? { ...p, ...patch } : p) };
}

// Neue Saison anlegen und optional Personen übernehmen (Saisonwechsel, minimal).
// Die alte Saison und ihr Kader bleiben unverändert.
export function createSeason(data, { teamId, name, startDate, endDate, phase = "vorbereitung", takeOver = [], today = startDate }) {
  const season = { id: uid(), teamId, name: name.trim(), startDate, endDate, phase, gamedays: [], goals: [] };
  // Team mit bisheriger Teamliste: Wechsel auf Saisonkader. Die bisherige Liste wird zuerst Kader der
  // laufenden Saison, damit deren Zusammensetzung erhalten bleibt (die Teamliste selbst bleibt unangetastet).
  let d = takeOver.length ? materialize(data, teamId, activeSeason(teamId, data, today)) : data;
  d = { ...d, seasons: [...list(d, "seasons"), season] };
  if (takeOver.length) {
    d = { ...d, rosterEntries: [...list(d, "rosterEntries"), ...takeOver.map(playerId =>
      ({ id: rosterEntryId(season.id, playerId), seasonId: season.id, teamId, playerId, status: "active" }))] };
  }
  return { data: d, season };
}

// Wer kann in eine neue Saison übernommen werden? Aktive/pausierte der Vorsaison bzw. die Teamliste.
export function takeOverCandidates(teamId, data, today) {
  const prev = activeSeason(teamId, data, today) ?? seasonsOf(teamId, data)[0] ?? null;
  return roster(teamId, prev, data, { statuses: ["active", "paused"] }).map(r => r.player);
}

// ─── Beobachtungen ───

export function newObservation({ teamId, playerId, date, text, tags = [], sessionId = "", planId = "", gameRef = "", user, authorName, now = new Date() }) {
  return {
    id: uid(), teamId, playerId, date, text: text.trim(), tags: normalizeTags(tags),
    ...(sessionId ? { sessionId } : {}), ...(planId ? { planId } : {}), ...(gameRef ? { gameRef } : {}),
    createdBy: user?.id ?? "", authorName: authorName ?? user?.name ?? "", capturedAt: now.toISOString(),
  };
}

export function addObservation(data, obs) {
  if (list(data, "observations").some(o => o.id === obs.id)) return data;   // Doppeltipp
  return { ...data, observations: [...list(data, "observations"), obs] };
}

export function updateObservation(data, id, patch) {
  return { ...data, observations: list(data, "observations").map(o => o.id === id ? { ...o, ...patch } : o) };
}

export function removeObservation(data, id) {
  return { ...data, observations: list(data, "observations").filter(o => o.id !== id) };
}

// Während des Trainings erfasste Beobachtungen beim Abschluss mit dem Training verknüpfen
export function linkObservations(data, ids, sessionId) {
  const set = new Set(ids);
  return { ...data, observations: list(data, "observations").map(o => set.has(o.id) ? { ...o, sessionId } : o) };
}

const newestFirst = (a, b) => b.date.localeCompare(a.date) || (b.capturedAt ?? "").localeCompare(a.capturedAt ?? "");

export function playerObservations(playerId, data, { teamId = null, season = null } = {}) {
  return list(data, "observations")
    .filter(o => o.playerId === playerId && (!teamId || o.teamId === teamId) && inSeason(season, o.date))
    .sort(newestFirst);
}

export function teamObservations(teamId, data, { season = null, since = null } = {}) {
  return list(data, "observations")
    .filter(o => o.teamId === teamId && inSeason(season, o.date) && (!since || o.date >= since))
    .sort(newestFirst);
}

// Beobachtungen eines Trainings: verknüpft, oder während der Durchführung über die Planung erfasst
export function sessionObservations(session, data) {
  return list(data, "observations")
    .filter(o => o.sessionId === session.id || (!o.sessionId && session.planId && o.planId === session.planId))
    .sort((a, b) => (a.capturedAt ?? "").localeCompare(b.capturedAt ?? ""));
}

// Wiederkehrende Themen einer Person: nur Häufigkeiten der Themen ihrer Beobachtungen – keine Bewertung
export function observationThemes(observations, { limit = 3 } = {}) {
  const count = new Map();
  observations.forEach(o => normalizeTags(o.tags).forEach(t => {
    const k = t.toLocaleLowerCase("de");
    const e = count.get(k) ?? { tag: t, count: 0 };
    e.count++; count.set(k, e);
  }));
  return [...count.values()].filter(e => e.count > 1).sort((a, b) => b.count - a.count).slice(0, limit);
}

// Anwesenheit einer Person in den erfassten Trainings eines Teams (nur Fakten)
export function playerAttendance(playerId, teamId, season, data) {
  const listed = list(data, "sessions").filter(s => s.teamId === teamId && inSeason(season, s.date)
    && (s.attendance ?? []).some(a => a.playerId === playerId));
  const present = listed.filter(s => isPresent(s.attendance.find(a => a.playerId === playerId).status)).length;
  return { present, listed: listed.length };
}

// ─── Saisonziele ───

export const newGoal = (text, tags = []) => ({ id: uid(), text: text.trim(), tags: normalizeTags(tags) });

// Trainings der Saison mit einem Thema des Ziels: Anzahl und Minuten. Ohne verknüpftes Thema null –
// es wird nichts geschätzt oder als Fortschritt ausgegeben.
export function goalCoverage(goal, sessions) {
  const keys = new Set(normalizeTags(goal?.tags).map(t => t.toLocaleLowerCase("de")));
  if (!keys.size) return null;
  const hits = sessions.filter(s => content(s).tags.some(t => keys.has(String(t).toLocaleLowerCase("de"))));
  return { count: hits.length, minutes: hits.reduce((m, s) => m + (s.durationMinutes ?? 0), 0), last: hits.map(s => s.date).sort().at(-1) ?? null };
}

// ─── Spiele (manuell oder aus dem Sports-Data-Adapter) ───

// Einheitliche Sicht für den Workspace: { key, source, date, time, opponent, isHome, result, … }.
// TrainerHub funktioniert ohne externe Spiele – dann gibt es nur die manuellen Spieltage.
export function teamGames(teamId, data, { season = null } = {}) {
  const manual = seasonsOf(teamId, data).flatMap(s => (s.gamedays ?? []).map(g => ({
    key: `gameday:${g.id}`, source: "manual", seasonId: s.id, date: g.date, time: g.time ?? "", opponent: g.opponent ?? "",
    isHome: !!g.isHome, result: g.result ?? "", status: g.result ? "finished" : "planned", competition: null, venue: "",
  })));
  const comps = new Map(list(data, "competitions").map(c => [c.id, c]));
  const external = list(data, "externalGames")
    .filter(g => (g.homeTeamId === teamId || g.awayTeamId === teamId) && (g.missingCount ?? 0) < 3)
    .map(g => {
      const isHome = g.homeTeamId === teamId;
      const finished = g.status === "finished";
      return {
        key: `games:${g.id}`, source: "external", date: g.date, time: g.time ?? "",
        opponent: isHome ? g.awayTeamName : g.homeTeamName, isHome,
        result: finished ? (isHome ? `${g.homeScore}:${g.awayScore}` : `${g.awayScore}:${g.homeScore}`) : "",
        status: g.status, competition: comps.get(g.competitionId)?.name ?? null, venue: g.venue ?? "",
        previousDate: g.previousDate || null, periods: finished ? g.periods ?? null : null,
      };
    });
  return [...manual, ...external].filter(g => g.date && inSeason(season, g.date)).sort(byDateTime);
}

// ─── Als Nächstes / Zuletzt ───

export function agenda(teamId, data, today) {
  const plans = list(data, "plannedSessions").filter(p => p.teamId === teamId && !p.recordedId).sort(byDateTime);
  const sessions = list(data, "sessions").filter(s => s.teamId === teamId).sort((a, b) => byDateTime(b, a));
  const games = teamGames(teamId, data).filter(g => g.status !== "cancelled");
  return {
    todayPlan: plans.find(p => p.date === today) ?? null,
    todaySession: sessions.find(s => s.date === today) ?? null,
    nextPlan: plans.find(p => p.date > today) ?? null,
    overdue: plans.filter(p => p.date < today),
    nextGame: games.find(g => g.date >= today && g.status !== "finished") ?? null,
    lastGame: [...games].reverse().find(g => g.date <= today && (g.status === "finished" || g.date < today)) ?? null,
    lastSession: sessions.find(s => s.date <= today) ?? null,
  };
}
