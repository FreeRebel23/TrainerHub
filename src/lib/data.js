import { useCallback, useState } from "react";
import { INIT, STORE_KEY, STATUSES, PRESENT_STATUSES } from "./constants.js";

// ─── Persistenz ───
// Einziger Speicherort ist localStorage["trainerhub_v1"]. Eine spätere Sync-Schicht
// (z. B. PocketBase) ersetzt loadData()/persist(), der Rest der App bleibt unverändert.

function clone(v) { return JSON.parse(JSON.stringify(v)); }

// Bringt ältere Datenstände auf das aktuelle Format (mutiert und gibt d zurück).
export function migrate(d) {
  if (!d.plannedSessions) d.plannedSessions = [];
  if (!d.venues) d.venues = clone(INIT.venues);
  if (!d.seasons) d.seasons = [];
  if (!d.settings) d.settings = { trainerName: "" };
  // Altes Format: team.players → globale players + playerIds
  if (!d.players) {
    const map = {};
    (d.teams ?? []).forEach(t => {
      (t.players ?? []).forEach(p => { if (!map[p.id]) map[p.id] = { ...p }; });
    });
    d.players = Object.values(map);
    d.teams = (d.teams ?? []).map(t => ({
      ...t,
      playerIds: t.playerIds ?? (t.players ?? []).map(p => p.id),
      players:   undefined,
    }));
  }
  return d;
}

export function loadData() {
  try {
    const r = localStorage.getItem(STORE_KEY);
    if (r) return migrate(JSON.parse(r));
  } catch { /* defekter Speicher → Startdaten */ }
  return clone(INIT);
}

export function persist(d) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch { /* Speicher voll/gesperrt */ }
}

export function useData() {
  const [data, setData] = useState(loadData);
  const update = useCallback(fn => {
    setData(prev => { const next = fn(prev); persist(next); return next; });
  }, []);
  return { data, update };
}

export function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

// ─── Fachliche Helfer ───

export function calcFactor(min) { return +(min / 60).toFixed(1); }

export function isPresent(status) { return PRESENT_STATUSES.includes(status); }

export function countPresent(session) {
  return (session.attendance ?? []).filter(a => isPresent(a.status)).length;
}

export function byId(list, id) { return (list ?? []).find(x => x.id === id); }

export function getTeamPlayers(teamId, data) {
  const team = (data.teams ?? []).find(t => t.id === teamId);
  if (!team) return [];
  const ids = new Set(team.playerIds ?? []);
  return (data.players ?? []).filter(p => ids.has(p.id));
}

export function getPlayerName(pid, data) {
  return (data.players ?? []).find(p => p.id === pid)?.name ?? "?";
}

export function getActiveSeason(teamId, seasons) {
  return (seasons ?? [])
    .filter(s => s.teamId === teamId && s.phase !== "abgeschlossen")
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
}

export function getSeasonSessions(season, sessions) {
  if (!season) return sessions ?? [];
  return (sessions ?? []).filter(s =>
    s.teamId === season.teamId &&
    s.date >= season.startDate &&
    s.date <= season.endDate
  );
}

// Alle Spieltage aller Saisons, angereichert um teamId (Spieltage liegen in season.gamedays)
export function allGamedays(data) {
  return (data.seasons ?? []).flatMap(s =>
    (s.gamedays ?? []).map(g => ({ ...g, teamId: s.teamId, seasonId: s.id }))
  );
}

// Planungen, die noch nicht erfasst sind
export function openPlans(data) {
  return (data.plannedSessions ?? []).filter(p => !p.recordedId);
}

// Partizipations-Ranking: Punkte = Σ Trainingsfaktor × Statusfaktor
export function computeRanking(data, teamId, sessions) {
  return getTeamPlayers(teamId, data).map(player => {
    let pts = 0, cnt = 0, commits = 0;
    const byType = {};
    sessions.forEach(s => {
      const a = (s.attendance ?? []).find(a => a.playerId === player.id);
      if (!a) return;
      const mult = STATUSES[a.status]?.factorMult ?? 0;
      pts += s.factor * mult;
      if (isPresent(a.status)) {
        cnt++;
        const tName = (data.trainingTypes ?? []).find(t => t.id === s.trainingTypeId)?.name ?? "?";
        byType[tName] = (byType[tName] ?? 0) + 1;
      }
      if (a.status === "injured_present") commits++;
    });
    return { player, pts: +pts.toFixed(1), cnt, commits,
             pct: sessions.length ? Math.round(cnt / sessions.length * 100) : 0, byType };
  }).sort((a, b) => b.pts - a.pts);
}
