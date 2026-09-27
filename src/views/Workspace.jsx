import { useState } from "react";
import {
  Play, CalendarPlus, Plus, ChevronDown, Trophy, Users, Target, BarChart3, CalendarRange, Eye, History, BookOpen, Check,
} from "lucide-react";
import { todayISO, fmtDateFull, relativeDay } from "../lib/dates.js";
import { byId, countPresent } from "../lib/data.js";
import { PHASES } from "../lib/constants.js";
import { content, planStatus, drillMinutes, knownTags } from "../lib/training.js";
import {
  seasonsOf, activeSeason, isHistorical, roster, agenda, teamObservations, teamGames, inSeason,
} from "../lib/workspace.js";
import { savePrefs } from "../lib/prefs.js";
import { Button, PageIntro, Section, Row, Meta, DateBlock, EmptyState, Notice } from "../components/ui.jsx";
import { Sheet } from "../components/sheet.jsx";
import { PlanStatus } from "../components/PlanStatus.jsx";
import { ObservationList, useObservationCapture } from "../components/observation.jsx";

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Hallo";
  return "Guten Abend";
}

// Mannschaft + Saison wählen (wenige Aktionen, kein versteckter Admin-Weg)
function TeamSwitcher({ open, onClose, data, teamId, seasonId, myTeamIds, today, onPick }) {
  const teams = data.teams ?? [];
  const mine = teams.filter(t => myTeamIds.includes(t.id));
  const others = teams.filter(t => !myTeamIds.includes(t.id));
  const seasons = seasonsOf(teamId, data);
  const active = activeSeason(teamId, data, today);
  const teamRow = t => (
    <Row key={t.id} title={t.name} aria-pressed={t.id === teamId}
      meta={activeSeason(t.id, data, today)?.name ?? "keine aktive Saison"}
      trail={t.id === teamId && <Check size={18} aria-hidden="true" />}
      onClick={() => onPick(t.id, null)} />
  );
  return (
    <Sheet open={open} onClose={onClose} title="Mannschaft wechseln">
      {mine.length > 0 && <div className="list">{mine.map(teamRow)}</div>}
      {others.length > 0 && (
        <>
          <p className="section__title">{mine.length ? "Weitere Teams der Abteilung" : "Teams"}</p>
          <div className="list">{others.map(teamRow)}</div>
        </>
      )}
      {seasons.length > 1 && (
        <>
          <p className="section__title">Saison</p>
          <div className="list">
            {seasons.map(s => (
              <Row key={s.id} title={s.name} aria-pressed={s.id === seasonId}
                meta={<Meta items={[s.id === active?.id ? "aktiv" : isHistorical(s, today) ? "abgeschlossen" : PHASES[s.phase]?.label]} />}
                trail={s.id === seasonId && <Check size={18} aria-hidden="true" />}
                onClick={() => onPick(teamId, s.id === active?.id ? null : s.id)} />
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

// Team Workspace – der tägliche Einstieg: Was steht an, was ist zu tun? (aktives Team + aktive Saison)
export function WorkspaceView({ data, update, go, params, teamId, myTeamIds, me }) {
  const today = todayISO();
  const [switcher, setSwitcher] = useState(false);
  const team = byId(data.teams, teamId);
  const type = id => byId(data.trainingTypes, id);
  const venue = id => byId(data.venues, id);
  const obs = useObservationCapture({ update, me, tagOptions: knownTags(data) });

  if (!team) {
    return (
      <div className="page">
        <PageIntro eyebrow={fmtDateFull(today)} title={greeting()} />
        <div className="page-body">
          <EmptyState icon={Users} title="Noch keine Mannschaft"
            text="Sobald dir ein Team zugeordnet ist, findest du hier Training, Kader und Saison."
            action={<Button variant="primary" onClick={() => go("teams", {}, { root: true })}>Zu den Teams</Button>} />
        </div>
      </div>
    );
  }

  const active = activeSeason(teamId, data, today);
  const season = (params.seasonId && byId(data.seasons, params.seasonId)) || active;
  const history = !!season && season.id !== active?.id;
  const ag = agenda(teamId, data, today);
  const players = roster(teamId, season, data, { statuses: ["active", "paused"] });
  const paused = players.filter(r => r.entry?.status === "paused").length;
  const rosterPlayers = roster(teamId, season, data, { statuses: ["active"] }).map(r => r.player);
  const recentObs = teamObservations(teamId, data, { season: history ? season : null }).slice(0, 3);
  const nameOf = id => byId(data.players, id)?.name ?? "?";
  const goals = season?.goals ?? [];
  const seasonSessions = (data.sessions ?? []).filter(s => s.teamId === teamId && inSeason(season, s.date));
  const seasonGames = teamGames(teamId, data, { season: history ? season : null });
  // Andere eigene Mannschaften mit Training heute: direkt wechseln können
  const otherToday = (data.plannedSessions ?? []).filter(p => p.date === today && !p.recordedId && p.teamId !== teamId && myTeamIds.includes(p.teamId));

  function pickTeam(id, seasonId) {
    savePrefs({ teamId: id });
    setSwitcher(false);
    go("home", { teamId: id, ...(seasonId ? { seasonId } : {}) }, { replace: true });
  }

  const observe = (extra = {}) => obs.open({ teamId, date: today, players: rosterPlayers, ...extra });
  const planMeta = p => [content(p).time && `${content(p).time} Uhr`, `${p.durationMinutes} min`, venue(p.venueId)?.name];
  const gameTitle = g => <>{g.isHome ? "Heim gegen" : "Auswärts bei"} {g.opponent || "offenem Gegner"}</>;
  const gameMeta = g => [relativeDay(g.date, today), g.time && `${g.time} Uhr`, g.result && `Ergebnis ${g.result}`, g.competition, g.venue];
  const tp = ag.todayPlan;

  return (
    <div className="page">
      <PageIntro
        eyebrow={<Meta items={[fmtDateFull(today), me?.name && `${greeting()}, ${me.name}`]} />}
        title={
          <button type="button" className="team-switch" onClick={() => setSwitcher(true)} aria-haspopup="dialog"
            aria-label={`Mannschaft ${team.name}${season ? `, ${season.name}` : ""} – wechseln`}>
            <span>{team.name}</span><ChevronDown size={22} aria-hidden="true" />
          </button>
        } />
      <div className="page-body">
        <p className="ws-season">
          {season
            ? <Meta items={[season.name, history ? "abgeschlossen" : PHASES[season.phase]?.label]} />
            : "Noch keine Saison – Trainings und Beobachtungen funktionieren trotzdem."}
        </p>

        {history && (
          <Notice tone="info" icon={History}>
            Rückblick auf {season.name}. Alles bleibt lesbar.{" "}
            {active && <button type="button" className="link-btn" onClick={() => pickTeam(teamId, null)}>Zur aktiven Saison ({active.name})</button>}
          </Notice>
        )}

        {!history && (tp ? (
          <div className="card card--accent">
            <p className="card__eyebrow">Heute{content(tp).time && ` · ${content(tp).time} Uhr`}</p>
            <p className="card__title">{type(tp.trainingTypeId)?.name ?? "Training"}</p>
            <p className="card__meta"><Meta items={[venue(tp.venueId)?.name, `${tp.durationMinutes} min`]} /></p>
            {content(tp).focus && <p className="focus-line hero-focus">{content(tp).focus}</p>}
            <p className="card__meta">
              <PlanStatus status={planStatus(tp)} label={planStatus(tp) === "prepared" && content(tp).checklist.length
                ? `${content(tp).checklist.length} Übungen vorbereitet${drillMinutes(content(tp).checklist) ? ` · ${drillMinutes(content(tp).checklist)} min` : ""}`
                : undefined} />
            </p>
            <div className="card__actions">
              <Button variant="primary" size="lg" icon={Play} className="grow" onClick={() => go("new_session", { planId: tp.id, step: 2 })}>
                Training starten
              </Button>
              <Button onClick={() => go("plan_detail", { planId: tp.id })}>Ansehen</Button>
            </div>
          </div>
        ) : ag.todaySession ? (
          <div className="card">
            <p className="card__eyebrow">Heute erfasst</p>
            <p className="card__title">{type(ag.todaySession.trainingTypeId)?.name ?? "Training"}</p>
            <p className="card__meta"><Meta items={[`${countPresent(ag.todaySession)} dabei`, `${ag.todaySession.durationMinutes} min`]} /></p>
            <div className="card__actions">
              <Button variant="primary" icon={Eye} onClick={() => observe({ sessionId: ag.todaySession.id, label: "Zum heutigen Training" })}>Beobachtung</Button>
              <Button onClick={() => go("session_detail", { sessionId: ag.todaySession.id })}>Öffnen</Button>
            </div>
          </div>
        ) : (
          <div className="btn-row">
            <Button variant="primary" size="lg" icon={CalendarPlus} onClick={() => go("plan_edit", { teamId })}>Training planen</Button>
            <Button size="lg" icon={Plus} onClick={() => go("new_session", { teamId })}>Erfassen</Button>
          </div>
        ))}

        {!history && otherToday.length > 0 && (
          <div className="list">
            {otherToday.map(p => (
              <Row key={p.id} title={<>Heute auch: {byId(data.teams, p.teamId)?.name}</>}
                meta={<Meta items={[content(p).time && `${content(p).time} Uhr`, type(p.trainingTypeId)?.name]} />}
                chevron onClick={() => pickTeam(p.teamId, null)} />
            ))}
          </div>
        )}

        {!history && ag.overdue.length > 0 && (
          <Section title="Noch nicht erfasst" hint={`${ag.overdue.length} geplant`}>
            <div className="list">
              {ag.overdue.slice(-3).map(p => (
                <Row key={p.id} lead={<DateBlock iso={p.date} today={today} />} title={type(p.trainingTypeId)?.name ?? "Training"}
                  meta={<Meta items={planMeta(p)} />}
                  trail={<span className="btn btn--sm btn--secondary" aria-hidden="true">Erfassen</span>}
                  aria-label={`${type(p.trainingTypeId)?.name ?? "Training"} vom ${fmtDateFull(p.date)} erfassen`}
                  onClick={() => go("new_session", { planId: p.id, step: 2 })} />
              ))}
            </div>
          </Section>
        )}

        {!history && (ag.nextPlan || ag.nextGame) && (
          <Section title="Als Nächstes">
            <div className="list">
              {[ag.nextPlan && { kind: "plan", date: ag.nextPlan.date, time: content(ag.nextPlan).time, item: ag.nextPlan },
                ag.nextGame && { kind: "game", date: ag.nextGame.date, time: ag.nextGame.time, item: ag.nextGame }]
                .filter(Boolean).sort((a, b) => a.date.localeCompare(b.date) || (a.time || "99").localeCompare(b.time || "99"))
                .map(({ kind, item }) => kind === "plan" ? (
                  <Row key={item.id} lead={<DateBlock iso={item.date} today={today} />} title={type(item.trainingTypeId)?.name ?? "Training"}
                    meta={<Meta items={[relativeDay(item.date, today), ...planMeta(item)]} />}
                    excerpt={content(item).focus || null}
                    trail={<PlanStatus status={planStatus(item)} label={planStatus(item) === "planned" ? "offen" : undefined} />}
                    chevron onClick={() => go("plan_detail", { planId: item.id })} />
                ) : (
                  <Row key={item.key} lead={<DateBlock iso={item.date} today={today} />} title={<>Spiel: {gameTitle(item)}</>}
                    meta={<Meta items={gameMeta(item)} />} trail={<Trophy size={18} aria-hidden="true" />}
                    chevron onClick={() => go("season_detail", { seasonId: season?.id, teamId })} />
                ))}
            </div>
          </Section>
        )}

        <Section title={history ? "Beobachtungen" : "Zuletzt"}
          action={!history && rosterPlayers.length > 0 && (
            <button type="button" className="btn btn--accent-ghost btn--sm" onClick={() => observe()}><Plus size={16} aria-hidden="true" />Beobachtung</button>
          )}>
          <div className="list">
            {!history && ag.lastSession && (
              <Row lead={<DateBlock iso={ag.lastSession.date} today={today} />} title={type(ag.lastSession.trainingTypeId)?.name ?? "Training"}
                meta={<Meta items={[relativeDay(ag.lastSession.date, today) || "Letztes Training", `${countPresent(ag.lastSession)} dabei`]} />}
                excerpt={content(ag.lastSession).focus || null}
                chevron onClick={() => go("session_detail", { sessionId: ag.lastSession.id })} />
            )}
            {!history && ag.lastGame && (
              <Row lead={<DateBlock iso={ag.lastGame.date} today={today} />} title={<>Spiel: {gameTitle(ag.lastGame)}</>}
                meta={<Meta items={gameMeta(ag.lastGame)} />} trail={<Trophy size={18} aria-hidden="true" />} />
            )}
          </div>
          <ObservationList items={recentObs} today={today} playerName={nameOf}
            onOpen={o => go("player", { playerId: o.playerId, teamId, ...(history ? { seasonId: season.id } : {}) })}
            emptyText={history ? "Keine Beobachtungen in dieser Saison."
              : rosterPlayers.length ? "Noch keine Beobachtungen. Während des Trainings geht das mit „Beobachtung“ in wenigen Sekunden." : "Noch keine Beobachtungen."} />
        </Section>

        <Section title="Mannschaft">
          <div className="list">
            <Row lead={<Users size={20} aria-hidden="true" />} title="Kader"
              meta={<Meta items={[`${players.length} Spieler:innen`, paused > 0 && `${paused} pausiert`, season?.name]} />}
              chevron onClick={() => go("roster", { teamId, ...(history ? { seasonId: season.id } : {}) })} />
          </div>
        </Section>

        <Section title="Saison">
          <div className="list">
            {season ? (
              <>
                <Row lead={<Target size={20} aria-hidden="true" />} title="Saisonziele"
                  meta={goals.length ? goals.map(g => g.text).join(" · ") : "Noch keine – wenige Schwerpunkte geben Orientierung"}
                  chevron onClick={() => go("season_detail", { seasonId: season.id, teamId })} />
                <Row lead={<BarChart3 size={20} aria-hidden="true" />} title="Trainingsinhalte"
                  meta={<Meta items={[`${seasonSessions.length} Trainings`, `${seasonGames.length} Spiele`]} />}
                  chevron onClick={() => go("stats", { teamId, seasonId: season.id })} />
              </>
            ) : (
              <Row lead={<CalendarRange size={20} aria-hidden="true" />} title="Saison anlegen"
                meta="Bündelt Kader, Spiele und Ziele einer Spielzeit" chevron onClick={() => go("new_season", { teamId })} />
            )}
            <Row lead={<BookOpen size={20} aria-hidden="true" />} title="Trainingsbuch" meta="Alle Trainings und Planungen"
              chevron onClick={() => go("training", {}, { root: true })} />
            {seasonsOf(teamId, data).length > 0 && (
              <Row lead={<History size={20} aria-hidden="true" />} title="Alle Saisons"
                meta={<Meta items={seasonsOf(teamId, data).map(s => s.name).slice(0, 3)} />}
                chevron onClick={() => go("season_list", { teamId })} />
            )}
          </div>
        </Section>
      </div>
      <TeamSwitcher open={switcher} onClose={() => setSwitcher(false)} data={data} teamId={teamId} seasonId={season?.id}
        myTeamIds={myTeamIds} today={today} onPick={pickTeam} />
      {obs.sheet}
    </div>
  );
}

