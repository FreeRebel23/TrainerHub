import { useState } from "react";
import { FileText, Tags, AlertTriangle, Sun } from "lucide-react";
import { DURATIONS } from "../lib/constants.js";
import { byId, calcFactor, uid } from "../lib/data.js";
import { fmtDateFull, getHoliday, getSchoolHoliday } from "../lib/dates.js";
import {
  planDefaults, duplicateAsPlan, content, normalizeTags, normalizeDrill, drillMinutes, knownTags,
} from "../lib/training.js";
import { Button, PageHeader, Section, Field, ChoiceChips, Notice } from "../components/ui.jsx";
import { DrillList, TagPicker } from "../components/training.jsx";

const fmtFactor = f => String(f).replace(".", ",");

// Anfangszustand: bestehende Planung bearbeiten, duplizieren oder neu (mit Defaults)
function initialDraft(data, params) {
  if (params.planId) {
    const p = byId(data.plannedSessions, params.planId);
    if (p) return { ...p, ...content(p) };
  }
  if (params.from) {
    const list = params.from.kind === "session" ? data.sessions : data.plannedSessions;
    const src = byId(list, params.from.id);
    if (src) return duplicateAsPlan(src, { isSession: params.from.kind === "session" });
  }
  const date = params.date ?? "";
  return {
    id: uid(), date, recordedId: null,
    ...planDefaults(data, { date, teamId: params.teamId }),
    focus: "", tags: [], checklist: [], note: "",
  };
}

// Ein Planungsweg für alles: neu (Trainingsbuch, Kalendertag), bearbeiten, duplizieren.
// Schnell: Datum + Team + Speichern. Ausführlich: Uhrzeit, Schwerpunkt, Themen, Übungen, Notiz.
export function PlanEditView({ data, update, params, back, finishFlow }) {
  const teams  = data.teams ?? [];
  const types  = data.trainingTypes ?? [];
  const venues = data.venues ?? [];
  const isEdit = !!params.planId && !!byId(data.plannedSessions, params.planId);
  const isDup  = !!params.from;
  const [draft, setDraft] = useState(() => initialDraft(data, params));
  const [touched, setTouched] = useState(false);
  const [showTags, setShowTags] = useState(() => draft.tags.length > 0);
  const [showNote, setShowNote] = useState(() => !!draft.note);
  const set = patch => setDraft(d => ({ ...d, ...patch }));

  function setDate(date) {
    // Uhrzeit nur vorschlagen, solange noch keine gewählt ist (keine stillen Überschreibungen)
    set({ date, ...(!draft.time && date ? { time: planDefaults(data, { date, teamId: draft.teamId }).time } : {}) });
  }
  function pickType(id) {
    const t = byId(types, id);
    set({ trainingTypeId: id, ...(t ? { durationMinutes: t.duration } : {}) });
  }

  const dateMissing = !draft.date;
  const drillSum = drillMinutes(draft.checklist);
  const holiday = draft.date && getHoliday(draft.date);
  const vacation = draft.date && getSchoolHoliday(draft.date);

  function save() {
    setTouched(true);
    if (dateMissing || !draft.teamId) return;
    const plan = {
      ...draft,
      time: draft.time || "",
      focus: draft.focus.trim(),
      tags: normalizeTags(draft.tags),
      checklist: draft.checklist.map(normalizeDrill).filter(d => d.text),
      note: draft.note.trim(),
    };
    if (isEdit) {
      update(d => ({ ...d, plannedSessions: d.plannedSessions.map(p => p.id === plan.id ? plan : p) }));
      back();
    } else {
      update(d => ({ ...d, plannedSessions: [...(d.plannedSessions ?? []), plan] }));
      finishFlow(1, "plan_detail", { planId: plan.id });
    }
  }

  const title = isEdit ? "Planung bearbeiten" : isDup ? "Training duplizieren" : "Training planen";

  return (
    <div className="page">
      <PageHeader title={title} back={back} />
      <form className="page-body" onSubmit={e => { e.preventDefault(); save(); }} noValidate>
        {isDup && <p className="field__hint">Inhalt und Übungen wurden übernommen. Wähle das neue Datum.</p>}

        <div className="form">
          <div className="field-grid">
            <Field label="Datum" htmlFor="pl-date" error={touched && dateMissing ? "Bitte ein Datum wählen." : null}>
              <input id="pl-date" className="input" type="date" value={draft.date} aria-invalid={touched && dateMissing}
                autoFocus={isDup} onChange={e => setDate(e.target.value)} />
            </Field>
            <Field label="Uhrzeit" htmlFor="pl-time" aside="optional">
              <input id="pl-time" className="input" type="time" value={draft.time} step={300}
                onChange={e => set({ time: e.target.value })} />
            </Field>
          </div>
          {draft.date && (holiday || vacation) && (
            <Notice tone={holiday ? "danger" : "warning"} icon={holiday ? AlertTriangle : Sun}>
              {holiday ? `Feiertag: ${holiday}` : `${vacation.name} – Ferientraining`}
            </Notice>
          )}
          {teams.length > 1 && (
            <Field label="Team">
              <ChoiceChips label="Team" value={draft.teamId} onChange={v => set({ teamId: v })}
                options={teams.map(t => ({ value: t.id, label: t.name }))} />
            </Field>
          )}
          <Field label="Trainingsart">
            <ChoiceChips label="Trainingsart" value={draft.trainingTypeId} onChange={pickType}
              options={types.map(t => ({ value: t.id, label: t.name }))} />
          </Field>
          <Field label="Dauer" aside={`Faktor ${fmtFactor(calcFactor(draft.durationMinutes))}`}>
            <ChoiceChips label="Dauer" value={draft.durationMinutes} onChange={v => set({ durationMinutes: v })}
              options={[...new Set([...DURATIONS, draft.durationMinutes])].sort((a, b) => a - b).map(m => ({ value: m, label: `${m} min` }))} />
          </Field>
          {venues.length > 0 && (
            <Field label="Halle">
              <ChoiceChips label="Halle" value={draft.venueId} onChange={v => set({ venueId: v })}
                options={venues.map(v => ({ value: v.id, label: v.name }))} />
            </Field>
          )}
        </div>

        <Section title="Inhalt" hint="optional – jederzeit ergänzbar">
          <div className="form">
            <Field label="Schwerpunkt" htmlFor="pl-focus">
              <input id="pl-focus" className="input" value={draft.focus} autoComplete="off" enterKeyHint="next"
                placeholder="z. B. Ballbewegung gegen aggressive Verteidigung" onChange={e => set({ focus: e.target.value })} />
            </Field>

            {showTags ? (
              <Field label="Themen" hint="Für die Saisonübersicht – was wird trainiert?">
                <TagPicker value={draft.tags} onChange={tags => set({ tags })} options={knownTags(data)} />
              </Field>
            ) : null}

            <div className="field">
              <span className="field__label">
                <span>Übungen</span>
                {draft.checklist.length > 0 && (
                  <span className={drillSum > draft.durationMinutes ? "text-tone tone-warning" : "text-3"}>
                    {drillSum > 0 ? `${drillSum} von ${draft.durationMinutes} min verplant` : `${draft.checklist.length} Übungen`}
                  </span>
                )}
              </span>
              <DrillList items={draft.checklist} onChange={checklist => set({ checklist })} checkable={false} />
              {draft.checklist.length > 0 && <p className="field__hint">Übung antippen für Dauer, Beschreibung und Reihenfolge.</p>}
            </div>

            {showNote && (
              <Field label="Notiz zur Vorbereitung" htmlFor="pl-note">
                <textarea id="pl-note" className="textarea" rows={3} value={draft.note} autoFocus={!draft.note}
                  placeholder="z. B. Material, Aufteilung, Hinweise für das Co-Training" onChange={e => set({ note: e.target.value })} />
              </Field>
            )}

            {(!showTags || !showNote) && (
              <div className="disclosure">
                {!showTags && <Button size="sm" icon={Tags} onClick={() => setShowTags(true)}>Themen</Button>}
                {!showNote && <Button size="sm" icon={FileText} onClick={() => setShowNote(true)}>Notiz</Button>}
              </div>
            )}
          </div>
        </Section>

        {draft.date && <p className="field__hint">{fmtDateFull(draft.date)}{draft.time ? `, ${draft.time} Uhr` : ""} · {byId(teams, draft.teamId)?.name}</p>}
      </form>
      <div className="action-bar">
        <Button variant="ghost" onClick={back}>Abbrechen</Button>
        <Button variant="primary" onClick={save}>{isEdit ? "Speichern" : "Planen"}</Button>
      </div>
    </div>
  );
}
