import { useEffect, useRef, useState } from "react";
import { Users, FileText, Sun, CheckCheck, RotateCcw, Pencil, Tags, History } from "lucide-react";
import { todayISO, fmtDateFull, getSchoolHoliday, getHoliday } from "../lib/dates.js";
import { byId, calcFactor, getTeamPlayers, isPresent, uid } from "../lib/data.js";
import { DURATIONS } from "../lib/constants.js";
import {
  sessionDraftFromPlan, planDefaults, normalizeTags, normalizeDrill, knownTags, content, drillMinutes,
} from "../lib/training.js";
import { draftKey, loadDraft, saveDraft, clearDraft } from "../lib/draft.js";
import {
  Button, IconButton, PageHeader, Section, EmptyState, Field, ChoiceChips, Notice, Meta,
} from "../components/ui.jsx";
import { AttendanceList, DrillList, TagPicker, TagList } from "../components/training.jsx";

const fmtFactor = f => String(f).replace(".", ",");
const defaultAtt = players => players.map(p => ({ playerId: p.id, status: p.injured ? "injured_absent" : "absent" }));

function initialForm(data, params, plan) {
  if (plan) return { ...sessionDraftFromPlan(plan), note: "" };
  const date = params.date ?? todayISO();
  const d = planDefaults(data, { date });
  return { date, time: "", ...d, focus: "", tags: [], checklist: [], note: "", planId: null };
}

// Training durchführen bzw. erfassen.
//  – aus einer Planung: direkt zur Anwesenheit, vorbereiteter Schwerpunkt und Übungen sind da
//  – ohne Planung: 1) Rahmen, 2) Anwesenheit
// Der Schritt liegt in der Navigation (params.step), params.steps zählt die Einträge des Ablaufs.
// Ein Entwurf wird laufend gesichert, damit ein Beenden der PWA in der Halle nichts verliert.
export function NewSessionView({ data, onSave, back, go, params }) {
  const plan = params.planId ? byId(data.plannedSessions, params.planId) : params.plan ?? null;
  const step = params.step === 2 ? 2 : 1;
  const teams  = data.teams ?? [];
  const types  = data.trainingTypes ?? [];
  const venues = data.venues ?? [];

  const [key] = useState(() => draftKey({ planId: plan?.id, date: params.date ?? todayISO() }));
  const [restored] = useState(() => loadDraft(key));
  const [form, setForm] = useState(() => restored?.form ?? initialForm(data, params, plan));
  const [att, setAtt] = useState(() => restored?.att ?? (step === 2 ? defaultAtt(getTeamPlayers(form.teamId, data)) : null));
  const [showRestored, setShowRestored] = useState(!!restored);
  const [showNote, setShowNote] = useState(() => !!form.note);
  const [editFocus, setEditFocus] = useState(false);
  const [editTags, setEditTags] = useState(false);
  const set = patch => setForm(f => ({ ...f, ...patch }));

  const team  = byId(teams, form.teamId);
  const type  = byId(types, form.trainingTypeId);
  const venue = byId(venues, form.venueId);
  const players = getTeamPlayers(form.teamId, data);
  const playerMap = Object.fromEntries(players.map(p => [p.id, p]));

  // Entwurf sichern, sobald tatsächlich etwas erfasst wurde (bloßes Öffnen legt keinen an)
  const pristine = useRef(null);
  useEffect(() => {
    if (!att) return;
    const snapshot = JSON.stringify({ form, att });
    if (pristine.current === null) pristine.current = restored ? "" : snapshot;
    if (snapshot !== pristine.current) saveDraft(key, { form, att });
  }, [key, form, att, restored]);

  function discardDraft() {
    clearDraft();
    pristine.current = null;
    setForm(initialForm(data, params, plan));
    setAtt(step === 2 ? defaultAtt(getTeamPlayers(plan?.teamId ?? form.teamId, data)) : null);
    setShowRestored(false);
  }

  function pickType(id) {
    const t = byId(types, id);
    set({ trainingTypeId: id, ...(t ? { durationMinutes: t.duration } : {}) });
  }
  function pickTeam(id) { set({ teamId: id }); setAtt(null); }

  const steps = params.steps ?? 1;
  function toAttendance() {
    // Anwesenheit neu aufbauen, wenn das Team gewechselt wurde
    if (!att || att.some(a => !playerMap[a.playerId]) || att.length !== players.length) setAtt(defaultAtt(players));
    go("new_session", { ...params, step: 2, steps: steps + 1 });
  }
  const changeFrame = () => go("new_session", { ...params, step: 1, steps: steps + 1 });

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

  const restoredNotice = showRestored && (
    <Notice tone="info" icon={History}>
      Dein begonnenes Training wurde wiederhergestellt.{" "}
      <button type="button" className="link-btn" onClick={discardDraft}>Verwerfen und neu beginnen</button>
    </Notice>
  );

  // ─── Schritt 2: Durchführen / Anwesenheit ───
  if (step === 2 && att) {
    const presentCount = att.filter(a => isPresent(a.status)).length;
    const commitCount  = att.filter(a => a.status === "injured_present").length;
    const setStatus = (pid, status) => setAtt(prev => prev.map(a => a.playerId === pid ? { ...a, status } : a));
    const allPresent = () => setAtt(prev => prev.map(a => {
      const p = playerMap[a.playerId];
      return isPresent(a.status) ? a : { ...a, status: p?.injured ? "injured_present" : "present" };
    }));
    const reset = () => setAtt(prev => prev.map(a => ({ ...a, status: playerMap[a.playerId]?.injured ? "injured_absent" : "absent" })));
    const done = form.checklist.filter(d => d.done).length;
    const prepNote = plan ? content(plan).note : "";

    function save() {
      onSave({
        id: uid(), teamId: form.teamId, trainingTypeId: form.trainingTypeId,
        date: form.date, durationMinutes: form.durationMinutes, factor: calcFactor(form.durationMinutes),
        attendance: att, note: form.note.trim(),
        venueId: form.venueId ?? null,
        checklist: form.checklist.map(normalizeDrill).filter(d => d.text),
        ...(form.time ? { time: form.time } : {}),
        ...(form.focus.trim() ? { focus: form.focus.trim() } : {}),
        ...(form.tags.length ? { tags: normalizeTags(form.tags) } : {}),
        ...(plan ? { planId: plan.id } : {}),
      }, plan?.id);
      clearDraft();
    }

    return (
      <div className="page">
        <PageHeader title={plan ? "Training" : "Anwesenheit"} back={back} />
        <div className="page-body">
          {restoredNotice}
          <div className="detail-head">
            <p className="detail-head__eyebrow">{form.date === todayISO() ? "Heute" : fmtDateFull(form.date)}{form.time && ` · ${form.time} Uhr`}</p>
            <h2 className="detail-head__title">{type?.name ?? "Training"}</h2>
            <p className="detail-head__meta"><Meta items={[team?.name, venue?.name, `${form.durationMinutes} min`]} /></p>
            <button type="button" className="link-btn self-start" onClick={changeFrame}>Datum, Team oder Rahmen ändern</button>
          </div>

          <Section title="Schwerpunkt" action={!editFocus && (
            <IconButton icon={Pencil} size={16} label="Schwerpunkt ändern" onClick={() => setEditFocus(true)} />)}>
            {editFocus || !form.focus ? (
              <input className="input" aria-label="Schwerpunkt" value={form.focus} autoFocus={editFocus}
                placeholder="Was trainiert ihr heute? (optional)" onChange={e => set({ focus: e.target.value })}
                onBlur={() => setEditFocus(false)} enterKeyHint="done" />
            ) : <p className="focus-line">{form.focus}</p>}
            {editTags
              ? <TagPicker value={form.tags} onChange={tags => set({ tags })} options={knownTags(data)} />
              : <div className="disclosure">
                  <TagList tags={form.tags} />
                  <button type="button" className="link-btn" onClick={() => setEditTags(true)}>
                    <Tags size={14} aria-hidden="true" /> {form.tags.length ? "Themen ändern" : "Themen wählen"}
                  </button>
                </div>}
          </Section>

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
            {commitCount > 0 && <p className="status tone-warning">{commitCount} trotz Verletzung dabei</p>}
          </Section>

          <Section title="Übungen" hint={form.checklist.length ? `${done}/${form.checklist.length} erledigt` : undefined}>
            {prepNote && <Notice tone="info" icon={FileText}>{prepNote}</Notice>}
            <DrillList items={form.checklist} onChange={checklist => set({ checklist })} editable={false} addable />
            {form.checklist.length > 0 && (
              <p className="field__hint">Abhaken, was ihr gemacht habt. Nicht Abgehaktes gilt als ausgelassen.
                {drillMinutes(form.checklist) > 0 && ` Geplant: ${drillMinutes(form.checklist)} min.`}</p>
            )}
          </Section>

          <Section title="Beobachtungen">
            {showNote || form.note ? (
              <textarea className="textarea expand" aria-label="Beobachtungen und Notizen" value={form.note}
                onChange={e => set({ note: e.target.value })} rows={3} autoFocus={showNote && !form.note}
                placeholder="Was lief gut, was nicht? Auffälligkeiten einzelner Spieler:innen …" />
            ) : (
              <Button variant="secondary" icon={FileText} onClick={() => setShowNote(true)} className="self-start">
                Notiz hinzufügen
              </Button>
            )}
          </Section>
        </div>
        <div className="action-bar">
          <Button variant="primary" size="lg" onClick={save}>Training abschließen</Button>
        </div>
      </div>
    );
  }

  // ─── Schritt 1: Rahmen ───
  const schoolHol = getSchoolHoliday(form.date);
  const holiday   = getHoliday(form.date);
  const dateInvalid = !form.date;

  return (
    <div className="page">
      <PageHeader title={plan ? "Rahmen anpassen" : "Training erfassen"} back={back} />
      <div className="page-body">
        {restoredNotice}
        <div className="form">
          <div className="field-grid">
            <Field label="Datum" htmlFor="ns-date" error={dateInvalid ? "Bitte ein Datum wählen." : null}>
              <input id="ns-date" className="input" type="date" value={form.date} max={todayISO()}
                aria-invalid={dateInvalid} onChange={e => set({ date: e.target.value })} />
            </Field>
            <Field label="Uhrzeit" htmlFor="ns-time" aside="optional">
              <input id="ns-time" className="input" type="time" value={form.time} step={300}
                onChange={e => set({ time: e.target.value })} />
            </Field>
          </div>
          {teams.length > 1 ? (
            <Field label="Team">
              <ChoiceChips label="Team" value={form.teamId} onChange={pickTeam}
                options={teams.map(t => ({ value: t.id, label: t.name, meta: t.playerIds?.length ?? 0 }))} />
            </Field>
          ) : null}
          {(schoolHol || holiday) && (
            <Notice tone={holiday ? "danger" : "warning"} icon={Sun}>
              {holiday ? `Feiertag: ${holiday}` : `${schoolHol.name} – Ferientraining`}
            </Notice>
          )}

          <Field label="Trainingsart">
            <ChoiceChips label="Trainingsart" value={form.trainingTypeId} onChange={pickType}
              options={types.map(t => ({ value: t.id, label: t.name }))} />
          </Field>

          <Field label="Dauer" aside={`Faktor ${fmtFactor(calcFactor(form.durationMinutes))}`}>
            <ChoiceChips label="Dauer" value={form.durationMinutes} onChange={v => set({ durationMinutes: v })}
              options={[...new Set([...DURATIONS, form.durationMinutes])].sort((a, b) => a - b).map(m => ({ value: m, label: `${m} min` }))} />
          </Field>

          {venues.length > 0 && (
            <Field label="Halle">
              <ChoiceChips label="Halle" value={form.venueId} onChange={v => set({ venueId: v })}
                options={venues.map(v => ({ value: v.id, label: v.name }))} />
            </Field>
          )}
        </div>
      </div>
      <div className="action-bar">
        <Button variant="primary" size="lg" disabled={dateInvalid || !form.trainingTypeId} onClick={toAttendance}>
          Weiter zur Anwesenheit
        </Button>
      </div>
    </div>
  );
}
