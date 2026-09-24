import { useState } from "react";
import { Pencil, Printer, Trash2, Sun, SearchX, Copy } from "lucide-react";
import { fmtDateLong, getSchoolHoliday } from "../lib/dates.js";
import { STATUSES, STATUS_KEYS } from "../lib/constants.js";
import { byId, countPresent } from "../lib/data.js";
import { printSession } from "../lib/io.js";
import {
  Button, IconButton, PageHeader, Section, Meta, EmptyState, Notice, Field, cx,
} from "../components/ui.jsx";
import { useConfirm } from "../components/confirm.jsx";
import { AttendanceList, DrillList, TagPicker, TagList } from "../components/training.jsx";
import { normalizeDrill, normalizeTags, knownTags } from "../lib/training.js";

// Eine Trainingseinheit: Inhalt zuerst, Aktionen zurückhaltend.
// Bearbeiten ist eine eigene Navigationsebene (params.edit): ohne Tab-Leiste, Zurück bzw.
// Wischgeste bricht ab, ein versehentlicher Tab-Wechsel kann keine Eingaben verwerfen.
export function SessionDetailView({ data, update, sessionId, editing, go, back, onDelete }) {
  const sess = (data.sessions ?? []).find(s => s.id === sessionId);
  const [editNote, setEditNote] = useState(() => sess?.note ?? "");
  const [editAtt,  setEditAtt]  = useState(() => (sess?.attendance ?? []).map(a => ({ ...a })));
  const [editCL,   setEditCL]   = useState(() => (sess?.checklist ?? []).map(d => ({ ...d })));
  const [editFocus, setEditFocus] = useState(() => sess?.focus ?? "");
  const [editTags,  setEditTags]  = useState(() => sess?.tags ?? []);
  const confirm = useConfirm();

  if (!sess) {
    return (
      <div className="page">
        <PageHeader title="Training" back={back} />
        <div className="page-body">
          <EmptyState icon={SearchX} title="Training nicht gefunden" text="Es wurde vermutlich gelöscht." />
        </div>
      </div>
    );
  }

  const team      = byId(data.teams, sess.teamId);
  const type      = byId(data.trainingTypes, sess.trainingTypeId);
  const venue     = byId(data.venues, sess.venueId);
  const getPlayer = pid => byId(data.players, pid);
  const schoolHol = getSchoolHoliday(sess.date);
  const att       = sess.attendance ?? [];
  const drills    = sess.checklist ?? [];
  const title     = type?.name ?? "Training";

  const startEdit = () => go("session_detail", { sessionId, edit: true });

  function saveEdit() {
    update(d => ({
      ...d,
      sessions: d.sessions.map(s => s.id !== sessionId ? s : {
        ...s, note: editNote.trim(), attendance: editAtt,
        checklist: editCL.map(normalizeDrill).filter(dr => dr.text),
        focus: editFocus.trim(), tags: normalizeTags(editTags),
      }),
    }));
    back();
  }

  // Übungen lassen sich direkt abhaken – z. B. während des Trainings in der Halle
  function setDrills(checklist) {
    update(d => ({ ...d, sessions: d.sessions.map(s => s.id !== sessionId ? s : { ...s, checklist }) }));
  }

  async function remove() {
    if (await confirm({ title: "Training löschen?", danger: true, confirmLabel: "Löschen",
      text: `${title} vom ${fmtDateLong(sess.date)} mit Anwesenheit, Notiz und Übungen. Das lässt sich nicht rückgängig machen.` })) onDelete(sess.id);
  }

  const head = (
    <div className="detail-head">
      <p className="detail-head__eyebrow">{fmtDateLong(sess.date)}{sess.time && ` · ${sess.time} Uhr`}</p>
      <h2 className="detail-head__title">{title}</h2>
      <p className="detail-head__meta"><Meta items={[team?.name, venue?.name]} /></p>
    </div>
  );

  // ─── Bearbeiten ───
  if (editing) {
    const setStatus = (pid, status) => setEditAtt(prev => prev.map(a => a.playerId === pid ? { ...a, status } : a));
    return (
      <div className="page">
        <PageHeader title="Training bearbeiten" back={back} />
        <div className="page-body">
          {head}
          <Field label="Schwerpunkt" htmlFor="se-focus">
            <input id="se-focus" className="input" value={editFocus} onChange={e => setEditFocus(e.target.value)}
              placeholder="Was wurde trainiert?" />
          </Field>
          <Field label="Themen">
            <TagPicker value={editTags} onChange={setEditTags} options={knownTags(data)} />
          </Field>
          <Section title="Übungen">
            <DrillList items={editCL} onChange={setEditCL} />
          </Section>
          <Section title="Beobachtungen">
            <textarea className="textarea" aria-label="Beobachtungen und Notizen" value={editNote}
              onChange={e => setEditNote(e.target.value)} rows={4} placeholder="Was lief gut, was nicht?" />
          </Section>
          <Section title="Anwesenheit" hint={`${editAtt.filter(a => ["present", "injured_present"].includes(a.status)).length} von ${editAtt.length} dabei`}>
            <AttendanceList rows={editAtt} getPlayer={getPlayer} onChange={setStatus} />
          </Section>
        </div>
        <div className="action-bar">
          <Button variant="ghost" onClick={back}>Abbrechen</Button>
          <Button variant="primary" onClick={saveEdit}>Speichern</Button>
        </div>
      </div>
    );
  }

  // ─── Ansehen ───
  const doneCount = drills.filter(d => d.done).length;

  return (
    <div className="page">
      <PageHeader title="Training" back={back} actions={<>
        <IconButton icon={Copy} label="Als neue Planung duplizieren" onClick={() => go("plan_edit", { from: { kind: "session", id: sess.id } })} />
        <IconButton icon={Printer} label="Drucken" onClick={() => printSession(sess, data)} />
        <IconButton icon={Trash2} label="Training löschen" variant="danger" onClick={remove} />
      </>} />
      <div className="page-body">
        {head}

        <div className="facts">
          <div><p className="fact__value">{countPresent(sess)}<span className="fact__of"> / {att.length}</span></p><p className="fact__label">dabei</p></div>
          <div><p className="fact__value">{sess.durationMinutes}</p><p className="fact__label">Minuten</p></div>
          <div><p className="fact__value">{String(sess.factor).replace(".", ",")}</p><p className="fact__label">Faktor</p></div>
        </div>

        {schoolHol && <Notice tone="warning" icon={Sun}>{schoolHol.name} – Ferientraining</Notice>}

        <div className="btn-row">
          <Button icon={Pencil} onClick={startEdit}>Bearbeiten</Button>
          <Button icon={Copy} variant="ghost" onClick={() => go("plan_edit", { from: { kind: "session", id: sess.id } })}>Duplizieren</Button>
        </div>

        {(sess.focus || (sess.tags ?? []).length > 0) && (
          <Section title="Schwerpunkt">
            {sess.focus && <p className="prose">{sess.focus}</p>}
            <TagList tags={sess.tags} />
          </Section>
        )}

        {drills.length > 0 && (
          <Section title="Übungen" hint={doneCount === drills.length ? "alle erledigt" : `${doneCount} von ${drills.length} durchgeführt`}>
            <DrillList items={drills} onChange={setDrills} editable={false} />
          </Section>
        )}

        <Section title={sess.focus || drills.length ? "Beobachtungen" : "Notiz"}>
          {sess.note ? <p className="prose">{sess.note}</p> : <p className="text-3">Keine Notiz.</p>}
        </Section>

        <Section title="Anwesenheit">
          {att.length === 0 ? <p className="text-3">Keine Anwesenheit erfasst.</p> : (
            <div className="list">
              {STATUS_KEYS.map(key => {
                const group = att.filter(a => a.status === key);
                if (!group.length) return null;
                const s = STATUSES[key];
                return (
                  <div key={key} className={cx("row", "row--top", `tone-${s.tone}`)}>
                    <span className="row__lead"><span className="dot" /></span>
                    <span className="row__main">
                      <span className="row__meta row__meta--2">{s.label} · {group.length}</span>
                      <span>{group.map(a => getPlayer(a.playerId)?.name ?? "?").join(", ")}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        {sess.erfasstVon && <p className="footnote">Erfasst von {sess.erfasstVon}</p>}
      </div>
    </div>
  );
}
