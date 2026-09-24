import { Plus, Trash2, AlertTriangle, Sun, Trophy } from "lucide-react";
import { todayISO, fmtDateFull, getHoliday, getSchoolHoliday } from "../lib/dates.js";
import { byId, countPresent, allGamedays } from "../lib/data.js";
import { content, planStatus, byDateTime } from "../lib/training.js";
import { PlanStatus } from "../components/PlanStatus.jsx";
import {
  Button, IconButton, PageHeader, Section, Row, Meta, Notice,
} from "../components/ui.jsx";
import { useConfirm } from "../components/confirm.jsx";

// Ein Kalendertag: was wurde trainiert, was ist geplant, neues Training planen.
export function CalendarDayView({ data, update, date, go, back }) {
  const teams  = data.teams ?? [];
  const types  = data.trainingTypes ?? [];
  const venues = data.venues ?? [];
  const confirm = useConfirm();

  const today     = todayISO();
  const canRecord = date <= today;
  const holiday   = getHoliday(date);
  const schoolHol = getSchoolHoliday(date);
  const planned   = (data.plannedSessions ?? []).filter(s => s.date === date).sort(byDateTime);
  const recorded  = (data.sessions ?? []).filter(s => s.date === date).sort(byDateTime);
  const games     = allGamedays(data).filter(g => g.date === date);
  const multiTeam = teams.length > 1;

  const type = id => byId(types, id);
  const team = id => byId(teams, id);

  async function deletePlanned(p) {
    if (!(await confirm({ title: "Geplantes Training löschen?", danger: true, confirmLabel: "Löschen",
      text: `${type(p.trainingTypeId)?.name ?? "Training"} am ${fmtDateFull(date)}` }))) return;
    update(d => ({ ...d, plannedSessions: (d.plannedSessions ?? []).filter(x => x.id !== p.id) }));
  }

  const nothing = !recorded.length && !planned.length && !games.length;

  return (
    <div className="page">
      <PageHeader title={fmtDateFull(date)} back={back} />
      <div className="page-body">

        {(holiday || schoolHol) && (
          <div className="section">
            {holiday && <Notice tone="danger" icon={AlertTriangle}><strong>Feiertag:</strong> {holiday}</Notice>}
            {schoolHol && <Notice tone="warning" icon={Sun}><strong>{schoolHol.name}</strong> · Ferientraining</Notice>}
          </div>
        )}

        {recorded.length > 0 && (
          <Section title="Erfasst">
            <div className="list">
              {recorded.map(s => (
                <Row key={s.id} className="tone-success"
                  lead={<span className="dot" />}
                  title={type(s.trainingTypeId)?.name ?? "Training"}
                  meta={<Meta items={[s.time && `${s.time} Uhr`, team(s.teamId)?.name, `${countPresent(s)} dabei`, `${s.durationMinutes} min`]} />}
                  excerpt={s.focus || null}
                  chevron onClick={() => go("session_detail", { sessionId: s.id })} />
              ))}
            </div>
          </Section>
        )}

        {planned.length > 0 && (
          <Section title="Geplant">
            <div className="list">
              {planned.map(p => {
                const c = content(p);
                const status = planStatus(p);
                return (
                  <div key={p.id} className="row-group">
                    <Row
                      title={type(p.trainingTypeId)?.name ?? "Training"}
                      meta={<Meta items={[c.time && `${c.time} Uhr`, team(p.teamId)?.name, `${p.durationMinutes} min`, byId(venues, p.venueId)?.name]} />}
                      excerpt={c.focus || null}
                      trail={<PlanStatus status={status} label={status === "planned" ? "offen" : undefined} />}
                      chevron onClick={() => go("plan_detail", { planId: p.id })} />
                    {status !== "done" && (
                      <div className="row-actions">
                        {canRecord && <Button variant="primary" size="sm" onClick={() => go("new_session", { planId: p.id, step: 2 })}>Training starten</Button>}
                        <IconButton icon={Trash2} label="Geplantes Training löschen" variant="danger" size={18} onClick={() => deletePlanned(p)} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {games.length > 0 && (
          <Section title="Spiel">
            <div className="list">
              {games.map(g => (
                <Row key={g.id}
                  lead={<Trophy size={18} aria-hidden="true" />}
                  title={<>{g.isHome ? "Heimspiel gegen" : "Auswärts bei"} {g.opponent || "offenem Gegner"}</>}
                  meta={<Meta items={[multiTeam && team(g.teamId)?.name, g.result && `Ergebnis ${g.result}`]} />}
                  chevron onClick={() => go("season_detail", { seasonId: g.seasonId, teamId: g.teamId })} />
              ))}
            </div>
          </Section>
        )}

        <div className="section">
          {nothing && <p className="text-3">An diesem Tag ist nichts eingetragen.</p>}
          <div className="btn-row">
            <Button variant={canRecord && date !== today ? "secondary" : "primary"} icon={Plus}
              onClick={() => go("plan_edit", { date })}>Training planen</Button>
            {canRecord && <Button icon={Plus} onClick={() => go("new_session", { date })}>Training erfassen</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}
