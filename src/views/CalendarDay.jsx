import { useState } from "react";
import { Plus, Trash2, AlertTriangle, Sun, Trophy } from "lucide-react";
import { todayISO, fmtDateFull, getHoliday, getSchoolHoliday } from "../lib/dates.js";
import { byId, countPresent, uid, calcFactor, allGamedays } from "../lib/data.js";
import { DURATIONS } from "../lib/constants.js";
import {
  Button, IconButton, PageHeader, Section, Row, Meta, Notice, Field, ChoiceChips,
} from "../components/ui.jsx";

// Ein Kalendertag: was wurde trainiert, was ist geplant, neues Training planen.
export function CalendarDayView({ data, update, date, go, back }) {
  const teams  = data.teams ?? [];
  const types  = data.trainingTypes ?? [];
  const venues = data.venues ?? [];
  const [showPlan, setShowPlan] = useState(false);
  const [teamId, setTeamId]   = useState(teams[0]?.id ?? "");
  const [typeId, setTypeId]   = useState(types[0]?.id ?? "");
  const [dur, setDur]         = useState(types[0]?.duration ?? 90);
  const [venueId, setVenueId] = useState(venues[0]?.id ?? "");

  const today     = todayISO();
  const canRecord = date <= today;
  const holiday   = getHoliday(date);
  const schoolHol = getSchoolHoliday(date);
  const planned   = (data.plannedSessions ?? []).filter(s => s.date === date);
  const recorded  = (data.sessions ?? []).filter(s => s.date === date);
  const games     = allGamedays(data).filter(g => g.date === date);
  const multiTeam = teams.length > 1;

  const type = id => byId(types, id);
  const team = id => byId(teams, id);

  function pickType(id) { setTypeId(id); const t = type(id); if (t) setDur(t.duration); }

  function savePlanned() {
    const plan = { id: uid(), teamId, trainingTypeId: typeId, durationMinutes: dur, date, venueId, recordedId: null };
    update(d => ({ ...d, plannedSessions: [...(d.plannedSessions ?? []), plan] }));
    setShowPlan(false);
  }

  function deletePlanned(p) {
    if (!window.confirm(`Geplantes Training „${type(p.trainingTypeId)?.name ?? "Training"}“ am ${fmtDateFull(date)} löschen?`)) return;
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
                  meta={<Meta items={[team(s.teamId)?.name, `${countPresent(s)} dabei`, `${s.durationMinutes} min`]} />}
                  chevron onClick={() => go("session_detail", { sessionId: s.id })} />
              ))}
            </div>
          </Section>
        )}

        {planned.length > 0 && (
          <Section title="Geplant">
            <div className="list">
              {planned.map(p => {
                const isRec = !!p.recordedId;
                return (
                  <Row key={p.id}
                    title={type(p.trainingTypeId)?.name ?? "Training"}
                    meta={<Meta items={[team(p.teamId)?.name, `${p.durationMinutes} min`, `Faktor ${String(calcFactor(p.durationMinutes)).replace(".", ",")}`, byId(venues, p.venueId)?.name]} />}
                    trail={isRec ? <span className="status tone-success">erfasst</span> : <>
                      {canRecord && <Button variant="primary" size="sm" onClick={() => go("new_session", { plan: p })}>Erfassen</Button>}
                      <IconButton icon={Trash2} label="Geplantes Training löschen" variant="danger" size={18} onClick={() => deletePlanned(p)} />
                    </>} />
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

        {!showPlan ? (
          <div className="section">
            {nothing && <p className="text-3">An diesem Tag ist nichts eingetragen.</p>}
            <div className="btn-row">
              {canRecord && <Button variant="primary" icon={Plus} onClick={() => go("new_session", { date })}>Training erfassen</Button>}
              <Button icon={Plus} onClick={() => setShowPlan(true)}>Training planen</Button>
            </div>
          </div>
        ) : (
          <Section title="Training planen" large className="expand">
            <div className="card form">
              {multiTeam && (
                <Field label="Team">
                  <ChoiceChips label="Team" value={teamId} onChange={setTeamId}
                    options={teams.map(t => ({ value: t.id, label: t.name }))} />
                </Field>
              )}
              <Field label="Trainingsart">
                <ChoiceChips label="Trainingsart" value={typeId} onChange={pickType}
                  options={types.map(t => ({ value: t.id, label: t.name }))} />
              </Field>
              <Field label="Dauer" aside={`Faktor ${String(calcFactor(dur)).replace(".", ",")}`}>
                <ChoiceChips label="Dauer" value={dur} onChange={setDur}
                  options={DURATIONS.map(m => ({ value: m, label: `${m} min` }))} />
              </Field>
              {venues.length > 0 && (
                <Field label="Halle">
                  <ChoiceChips label="Halle" value={venueId} onChange={setVenueId}
                    options={venues.map(v => ({ value: v.id, label: v.name }))} />
                </Field>
              )}
              {holiday && <Notice tone="danger" icon={AlertTriangle}>Achtung: gesetzlicher Feiertag ({holiday}).</Notice>}
              <div className="btn-row">
                <Button variant="ghost" onClick={() => setShowPlan(false)}>Abbrechen</Button>
                <Button variant="primary" onClick={savePlanned} disabled={!teamId || !typeId}>Planen</Button>
              </div>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
