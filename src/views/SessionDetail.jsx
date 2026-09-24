import { useState } from "react";
import { Pencil, Printer, Trash2, Sun, SearchX } from "lucide-react";
import { fmtDateLong, getSchoolHoliday } from "../lib/dates.js";
import { STATUSES, STATUS_KEYS } from "../lib/constants.js";
import { byId, countPresent } from "../lib/data.js";
import { printSession } from "../lib/io.js";
import {
  Button, IconButton, PageHeader, Section, Meta, EmptyState, Notice, cx,
} from "../components/ui.jsx";
import { AttendanceList, DrillList } from "../components/training.jsx";

// Eine Trainingseinheit: Inhalt zuerst, Aktionen zurückhaltend.
export function SessionDetailView({ data, update, sessionId, back, onDelete }) {
  const sess = (data.sessions ?? []).find(s => s.id === sessionId);
  const [editing,  setEditing]  = useState(false);
  const [editNote, setEditNote] = useState("");
  const [editAtt,  setEditAtt]  = useState([]);
  const [editCL,   setEditCL]   = useState([]);

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

  function startEdit() {
    setEditNote(sess.note ?? "");
    setEditAtt(att.map(a => ({ ...a })));
    setEditCL(drills.map(d => ({ ...d })));
    setEditing(true);
  }

  function saveEdit() {
    update(d => ({
      ...d,
      sessions: d.sessions.map(s => s.id !== sessionId ? s : {
        ...s, note: editNote.trim(), attendance: editAtt, checklist: editCL,
      }),
    }));
    setEditing(false);
  }

  // Übungen lassen sich direkt abhaken – z. B. während des Trainings in der Halle
  function setDrills(checklist) {
    update(d => ({ ...d, sessions: d.sessions.map(s => s.id !== sessionId ? s : { ...s, checklist }) }));
  }

  function remove() {
    if (window.confirm(`Training „${title}“ vom ${fmtDateLong(sess.date)} wirklich löschen?`)) onDelete(sess.id);
  }

  const head = (
    <div className="detail-head">
      <p className="detail-head__eyebrow">{fmtDateLong(sess.date)}</p>
      <h2 className="detail-head__title">{title}</h2>
      <p className="detail-head__meta"><Meta items={[team?.name, venue?.name]} /></p>
    </div>
  );

  // ─── Bearbeiten ───
  if (editing) {
    const setStatus = (pid, status) => setEditAtt(prev => prev.map(a => a.playerId === pid ? { ...a, status } : a));
    return (
      <div className="page">
        <PageHeader title="Training bearbeiten" back={() => setEditing(false)} />
        <div className="page-body">
          {head}
          <Section title="Notiz">
            <textarea className="textarea" aria-label="Trainingsnotiz" value={editNote}
              onChange={e => setEditNote(e.target.value)} rows={4} placeholder="Schwerpunkt, Beobachtungen …" />
          </Section>
          <Section title="Übungen">
            <DrillList items={editCL} onChange={setEditCL} />
          </Section>
          <Section title="Anwesenheit" hint={`${editAtt.filter(a => ["present", "injured_present"].includes(a.status)).length} von ${editAtt.length} dabei`}>
            <AttendanceList rows={editAtt} getPlayer={getPlayer} onChange={setStatus} />
          </Section>
        </div>
        <div className="action-bar">
          <Button variant="ghost" onClick={() => setEditing(false)}>Abbrechen</Button>
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

        <Button icon={Pencil} onClick={startEdit} className="self-start">Bearbeiten</Button>

        <Section title="Notiz">
          {sess.note ? <p className="prose">{sess.note}</p> : <p className="text-3">Keine Notiz.</p>}
        </Section>

        {drills.length > 0 && (
          <Section title="Übungen" hint={doneCount === drills.length ? "alle erledigt" : `${doneCount}/${drills.length} erledigt`}>
            <DrillList items={drills} onChange={setDrills} editable={false} />
          </Section>
        )}

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
