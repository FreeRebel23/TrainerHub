import { useState } from "react";
import { Users, FileText, ListChecks, Sun, CheckCheck, RotateCcw } from "lucide-react";
import { todayISO, fmtDateFull, getSchoolHoliday, getHoliday } from "../lib/dates.js";
import { byId, calcFactor, getTeamPlayers, isPresent, uid } from "../lib/data.js";
import { DURATIONS } from "../lib/constants.js";
import {
  Button, PageHeader, Section, EmptyState, Field, ChoiceChips, Notice, Meta,
} from "../components/ui.jsx";
import { AttendanceList, DrillList } from "../components/training.jsx";

const fmtFactor = f => String(f).replace(".", ",");

// Erfassen in zwei Schritten: 1) Rahmen (vorbelegt aus Planung/Kontext), 2) Anwesenheit.
// Der Schritt liegt in der Navigation (params.step), damit Zurück/Wischgeste im
// Schritt 2 zum Schritt 1 führt statt die Eingaben zu verwerfen.
export function NewSessionView({ data, onSave, back, go, params }) {
  const plan = params?.plan;
  const step = params?.step === 2 ? 2 : 1;
  const teams  = data.teams ?? [];
  const types  = data.trainingTypes ?? [];
  const venues = data.venues ?? [];

  const [date, setDate]       = useState(plan?.date ?? params?.date ?? todayISO());
  const [teamId, setTeam]     = useState(plan?.teamId ?? teams[0]?.id ?? "");
  const [typeId, setType]     = useState(plan?.trainingTypeId ?? types[0]?.id ?? "");
  const [dur, setDur]         = useState(plan?.durationMinutes ?? types[0]?.duration ?? 90);
  const [venueId, setVenueId] = useState(plan?.venueId ?? venues[0]?.id ?? "");

  // Schritt 2 — Zustand bleibt beim Zurückspringen erhalten
  const [att, setAtt]           = useState(null);
  const [note, setNote]         = useState("");
  const [showNote, setShowNote] = useState(false);
  const [drills, setDrills]     = useState([]);
  const [showDrills, setShowDrills] = useState(false);

  const team  = byId(teams, teamId);
  const type  = byId(types, typeId);
  const venue = byId(venues, venueId);
  const players = getTeamPlayers(teamId, data);
  const playerMap = Object.fromEntries(players.map(p => [p.id, p]));

  function pickType(id) {
    setType(id);
    const t = byId(types, id);
    if (t) setDur(t.duration);
  }

  function pickTeam(id) { setTeam(id); setAtt(null); }

  function toAttendance() {
    // Anwesenheit neu aufbauen, wenn das Team gewechselt wurde
    if (!att || att.some(a => !playerMap[a.playerId]) || att.length !== players.length) {
      setAtt(players.map(p => ({ playerId: p.id, status: p.injured ? "injured_absent" : "absent" })));
    }
    go("new_session", { ...params, step: 2 }, { replace: params?.step === 2 });
  }

  if (!teams.length) {
    return (
      <div className="page">
        <PageHeader title="Training erfassen" back={back} />
        <div className="page-body">
          <EmptyState icon={Users} title="Noch kein Team"
            text="Lege zuerst ein Team mit Spieler:innen an."
            action={<Button variant="primary" onClick={() => go("teams", {}, { root: true })}>Zu den Teams</Button>} />
        </div>
      </div>
    );
  }

  // ─── Schritt 2: Anwesenheit ───
  if (step === 2 && att) {
    const presentCount = att.filter(a => isPresent(a.status)).length;
    const commitCount  = att.filter(a => a.status === "injured_present").length;
    const setStatus = (pid, status) => setAtt(prev => prev.map(a => a.playerId === pid ? { ...a, status } : a));
    const allPresent = () => setAtt(prev => prev.map(a => {
      const p = playerMap[a.playerId];
      return isPresent(a.status) ? a : { ...a, status: p?.injured ? "injured_present" : "present" };
    }));
    const reset = () => setAtt(prev => prev.map(a => ({ ...a, status: playerMap[a.playerId]?.injured ? "injured_absent" : "absent" })));

    function save() {
      onSave({
        id: uid(), teamId: team.id, trainingTypeId: type?.id ?? typeId,
        date, durationMinutes: dur, factor: calcFactor(dur),
        attendance: att, note: note.trim(),
        venueId: venue?.id ?? null,
        checklist: drills,
      }, plan?.id);
    }

    return (
      <div className="page">
        <PageHeader title="Anwesenheit" back={back} />
        <div className="page-body">
          <div className="detail-head">
            <p className="detail-head__eyebrow">{date === todayISO() ? "Heute" : fmtDateFull(date)}</p>
            <p className="detail-head__meta">
              <Meta items={[type?.name, team?.name, `${dur} min`, venue?.name]} />
            </p>
          </div>

          <Section>
            <div className="att-toolbar">
              <p className="att-count" aria-live="polite"><strong>{presentCount}</strong> von {att.length} dabei</p>
              {presentCount < att.length
                ? <Button size="sm" icon={CheckCheck} onClick={allPresent}>Alle dabei</Button>
                : <Button size="sm" variant="ghost" icon={RotateCcw} onClick={reset}>Zurücksetzen</Button>}
            </div>
            {att.length === 0 ? (
              <EmptyState icon={Users} title="Keine Spieler:innen im Kader"
                text={`${team?.name} hat noch keine Spieler:innen. Du kannst das Training trotzdem speichern.`} />
            ) : (
              <AttendanceList rows={att} getPlayer={pid => playerMap[pid]} onChange={setStatus} />
            )}
            <p className="field__hint">Antippen = dabei / nicht dabei. Über den Pfeil weitere Status wählen.</p>
            {commitCount > 0 && (
              <p className="status tone-warning">{commitCount} trotz Verletzung dabei</p>
            )}
          </Section>

          <Section title="Notiz">
            {showNote || note ? (
              <textarea className="textarea expand" aria-label="Trainingsnotiz" value={note} onChange={e => setNote(e.target.value)}
                placeholder="Schwerpunkt, Beobachtungen – z. B. Pick & Roll verteidigen, gute Intensität" rows={3} autoFocus={showNote && !note} />
            ) : (
              <Button variant="secondary" icon={FileText} onClick={() => setShowNote(true)} className="self-start">
                Notiz hinzufügen
              </Button>
            )}
          </Section>

          <Section title="Übungen" hint={drills.length ? `${drills.filter(d => d.done).length}/${drills.length} erledigt` : undefined}>
            {showDrills || drills.length ? (
              <DrillList items={drills} onChange={setDrills} autoFocus={showDrills && drills.length === 0} />
            ) : (
              <Button variant="secondary" icon={ListChecks} onClick={() => setShowDrills(true)} className="self-start">
                Übungen hinzufügen
              </Button>
            )}
          </Section>
        </div>
        <div className="action-bar">
          <Button variant="primary" size="lg" onClick={save}>Training speichern</Button>
        </div>
      </div>
    );
  }

  // ─── Schritt 1: Rahmen ───
  const schoolHol = getSchoolHoliday(date);
  const holiday   = getHoliday(date);
  const dateInvalid = !date;

  return (
    <div className="page">
      <PageHeader title={plan ? "Geplantes Training erfassen" : "Training erfassen"} back={back} />
      <div className="page-body">
        <div className="form">
          <div className="field-grid">
            <Field label="Datum" htmlFor="ns-date" error={dateInvalid ? "Bitte ein Datum wählen." : null}>
              <input id="ns-date" className="input" type="date" value={date} max={todayISO()}
                aria-invalid={dateInvalid} onChange={e => setDate(e.target.value)} />
            </Field>
            {teams.length > 1 ? (
              <Field label="Team" htmlFor="ns-team">
                <select id="ns-team" className="select" value={teamId} onChange={e => pickTeam(e.target.value)}>
                  {teams.map(t => <option key={t.id} value={t.id}>{t.name} ({t.playerIds?.length ?? 0})</option>)}
                </select>
              </Field>
            ) : (
              <Field label="Team"><p className="input input--static">{team?.name}</p></Field>
            )}
          </div>
          {(schoolHol || holiday) && (
            <Notice tone={holiday ? "danger" : "warning"} icon={Sun}>
              {holiday ? `Feiertag: ${holiday}` : `${schoolHol.name} – Ferientraining`}
            </Notice>
          )}

          <Field label="Trainingsart">
            <ChoiceChips label="Trainingsart" value={typeId} onChange={pickType}
              options={types.map(t => ({ value: t.id, label: t.name }))} />
          </Field>

          <Field label="Dauer" aside={`Faktor ${fmtFactor(calcFactor(dur))}`}>
            <ChoiceChips label="Dauer" value={dur} onChange={setDur}
              options={[...new Set([...DURATIONS, dur])].sort((a, b) => a - b).map(m => ({ value: m, label: `${m} min` }))} />
          </Field>

          {venues.length > 0 && (
            <Field label="Halle">
              <ChoiceChips label="Halle" value={venueId} onChange={setVenueId}
                options={venues.map(v => ({ value: v.id, label: v.name }))} />
            </Field>
          )}
        </div>
      </div>
      <div className="action-bar">
        <Button variant="primary" size="lg" disabled={dateInvalid || !typeId} onClick={toAttendance}>
          Weiter zur Anwesenheit
        </Button>
      </div>
    </div>
  );
}
