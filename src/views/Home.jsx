import { Plus, ClipboardCheck, CalendarClock, BookOpen, Trophy } from "lucide-react";
import { todayISO, relativeDay, fmtDateFull, addDays, getHoliday, getSchoolHoliday } from "../lib/dates.js";
import { byId, countPresent, getActiveSeason, openPlans, allGamedays } from "../lib/data.js";
import { PHASES } from "../lib/constants.js";
import { Button, PageIntro, Section, Row, Meta, DateBlock, EmptyState } from "../components/ui.jsx";

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Hallo";
  return "Guten Abend";
}

// Start beantwortet: Was ist für mich jetzt relevant?
export function HomeView({ data, go }) {
  const today = todayISO();
  const name  = data.settings?.trainerName?.trim();
  const type  = id => byId(data.trainingTypes, id);
  const team  = id => byId(data.teams, id);
  const venue = id => byId(data.venues, id);
  const multiTeam = (data.teams ?? []).length > 1;

  const sessions = [...(data.sessions ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const plans    = [...openPlans(data)].sort((a, b) => a.date.localeCompare(b.date));

  const todayPlan   = plans.find(p => p.date === today);
  const todaySess   = sessions.find(s => s.date === today);
  // Geplant, aber in den letzten 14 Tagen nicht erfasst → sollte nachgetragen werden
  const overdue     = plans.filter(p => p.date < today && p.date >= addDays(today, -14));
  // Weitere heutige Planungen (z. B. zweites Team) bleiben sichtbar und direkt erfassbar
  const upcoming    = plans.filter(p => p.date >= today && p !== todayPlan).slice(0, 3);
  const nextGame    = allGamedays(data).filter(g => g.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  // Nächste Trainings und nächstes Spiel chronologisch gemischt
  const agenda = [
    ...upcoming.map(p => ({ kind: "plan", date: p.date, item: p })),
    ...(nextGame ? [{ kind: "game", date: nextGame.date, item: nextGame }] : []),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const recent      = sessions.slice(0, 3);

  const firstTeam = (data.teams ?? [])[0];
  const season = firstTeam ? getActiveSeason(firstTeam.id, data.seasons) : null;

  const planMeta = p => [multiTeam && team(p.teamId)?.name, `${p.durationMinutes} min`, venue(p.venueId)?.name];

  return (
    <div className="page">
      <PageIntro
        eyebrow={<Meta items={[fmtDateFull(today), season && `${season.name} · ${PHASES[season.phase]?.label ?? ""}`]} />}
        title={name ? `${greeting()}, ${name}` : greeting()}
      />
      <div className="page-body">

        {/* Fokus: das eine, was jetzt ansteht */}
        {todayPlan ? (
          <div className="card card--accent">
            <p className="card__eyebrow">Heute geplant</p>
            <p className="card__title">{type(todayPlan.trainingTypeId)?.name ?? "Training"}</p>
            <p className="card__meta"><Meta items={[team(todayPlan.teamId)?.name, `${todayPlan.durationMinutes} min`, venue(todayPlan.venueId)?.name]} /></p>
            {(getHoliday(today) || getSchoolHoliday(today)) && (
              <p className="card__meta text-3">{getHoliday(today) ?? getSchoolHoliday(today)?.name}</p>
            )}
            <div className="card__actions">
              <Button variant="primary" size="lg" block icon={ClipboardCheck}
                onClick={() => go("new_session", { plan: todayPlan })}>
                Anwesenheit erfassen
              </Button>
            </div>
          </div>
        ) : todaySess ? (
          <div className="card">
            <p className="card__eyebrow">Heute erfasst</p>
            <p className="card__title">{type(todaySess.trainingTypeId)?.name ?? "Training"}</p>
            <p className="card__meta"><Meta items={[team(todaySess.teamId)?.name, `${countPresent(todaySess)} dabei`, `${todaySess.durationMinutes} min`]} /></p>
            <div className="card__actions">
              <Button onClick={() => go("session_detail", { sessionId: todaySess.id })}>Öffnen</Button>
              <Button variant="ghost" icon={Plus} onClick={() => go("new_session")}>Weiteres Training</Button>
            </div>
          </div>
        ) : (
          <Button variant="primary" size="lg" block icon={Plus} onClick={() => go("new_session")}>
            Training erfassen
          </Button>
        )}

        {overdue.length > 0 && (
          <Section title="Noch nicht erfasst" hint={`${overdue.length} geplant`}>
            <div className="list">
              {overdue.map(p => (
                <Row key={p.id}
                  lead={<DateBlock iso={p.date} today={today} />}
                  title={type(p.trainingTypeId)?.name ?? "Training"}
                  meta={<Meta items={planMeta(p)} />}
                  trail={<span className="btn btn--sm btn--secondary" aria-hidden="true">Erfassen</span>}
                  aria-label={`${type(p.trainingTypeId)?.name ?? "Training"} vom ${fmtDateFull(p.date)} erfassen`}
                  onClick={() => go("new_session", { plan: p })} />
              ))}
            </div>
          </Section>
        )}

        {agenda.length > 0 && (
          <Section title="Als Nächstes">
            <div className="list">
              {agenda.map(({ kind, item }) => kind === "plan" ? (
                <Row key={item.id}
                  lead={<DateBlock iso={item.date} today={today} />}
                  title={type(item.trainingTypeId)?.name ?? "Training"}
                  meta={<Meta items={[relativeDay(item.date, today), ...planMeta(item)]} />}
                  trail={item.date === today ? <span className="btn btn--sm btn--secondary" aria-hidden="true">Erfassen</span> : null}
                  chevron={item.date !== today}
                  onClick={() => item.date === today
                    ? go("new_session", { plan: item })
                    : go("calendar_day", { date: item.date })} />
              ) : (
                <Row key={item.id}
                  lead={<DateBlock iso={item.date} today={today} />}
                  title={<>Spiel {item.isHome ? "gegen" : "bei"} {item.opponent || "offenem Gegner"}</>}
                  meta={<Meta items={[relativeDay(item.date, today), item.isHome ? "Heimspiel" : "Auswärtsspiel", multiTeam && team(item.teamId)?.name]} />}
                  trail={<Trophy size={18} aria-hidden="true" />}
                  chevron
                  onClick={() => go("season_detail", { seasonId: item.seasonId, teamId: item.teamId })} />
              ))}
            </div>
          </Section>
        )}

        <Section title="Zuletzt trainiert"
          action={sessions.length > 3 && (
            <button type="button" className="btn btn--accent-ghost btn--sm" onClick={() => go("training", {}, { root: true })}>
              Alle {sessions.length}
            </button>
          )}>
          {recent.length === 0 ? (
            <EmptyState icon={BookOpen} title="Noch keine Trainings erfasst"
              text="Erfasse dein erstes Training – es erscheint dann im Trainingsbuch." />
          ) : (
            <div className="list">
              {recent.map(s => (
                <Row key={s.id}
                  lead={<DateBlock iso={s.date} today={today} />}
                  title={type(s.trainingTypeId)?.name ?? "Training"}
                  meta={<Meta items={[relativeDay(s.date, today), multiTeam && team(s.teamId)?.name, `${countPresent(s)} dabei`, `${s.durationMinutes} min`]} />}
                  excerpt={s.note || null}
                  chevron onClick={() => go("session_detail", { sessionId: s.id })} />
              ))}
            </div>
          )}
        </Section>

        {upcoming.length === 0 && !todayPlan && plans.length === 0 && sessions.length > 0 && (
          <p className="inline-hint">
            <CalendarClock size={16} aria-hidden="true" />
            Keine Trainings geplant. Im Kalender des Trainingsbuchs kannst du Termine anlegen.
          </p>
        )}
      </div>
    </div>
  );
}
