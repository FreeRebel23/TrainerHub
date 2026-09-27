// Trainerbeobachtungen: schnelle Erfassung (einhändig in der Halle) und Verlauf.
// Eine Beobachtung ist ein Datensatz – sie erscheint am Training und im Spielerprofil.
import { useRef, useState } from "react";
import { Search, Tags } from "lucide-react";
import { Button, Meta, cx } from "./ui.jsx";
import { Sheet } from "./sheet.jsx";
import { TagPicker } from "./training.jsx";
import { fmtRelative } from "../lib/dates.js";
import { newObservation, addObservation } from "../lib/workspace.js";

// players: Auswahl (Kader); player: fest vorgegeben (Spielerprofil). context: teamId, date, planId, sessionId, gameRef
export function ObservationSheet({ open, onClose, players = [], player = null, tagOptions = [], onSave, contextLabel }) {
  const [pid, setPid] = useState(player?.id ?? null);
  const [text, setText] = useState("");
  const [tags, setTags] = useState([]);
  const [showTags, setShowTags] = useState(false);
  const [query, setQuery] = useState("");
  const textRef = useRef(null);
  const chosen = player ?? players.find(p => p.id === pid) ?? null;
  const shown = query.trim()
    ? players.filter(p => p.name.toLocaleLowerCase("de").includes(query.trim().toLocaleLowerCase("de")))
    : players;

  function pick(id) {
    setPid(id);
    // Fokus direkt in der Tipp-Geste: iOS öffnet die Tastatur nur dann
    textRef.current?.focus();
  }

  function save() {
    if (!chosen || !text.trim()) return;
    onSave({ playerId: chosen.id, text, tags });
    setText(""); setTags([]); setShowTags(false); setQuery("");
    if (!player) setPid(null);
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={chosen ? `Beobachtung · ${chosen.name}` : "Beobachtung"}
      footer={<Button variant="primary" size="lg" disabled={!chosen || !text.trim()} onClick={save}>Speichern</Button>}>
      {contextLabel && <p className="text-3">{contextLabel}</p>}
      {!player && (
        <div className="obs-pick">
          {players.length > 12 && (
            <div className="search">
              <Search size={18} className="search__icon" aria-hidden="true" />
              <label htmlFor="obs-search" className="sr-only">Spieler:in suchen</label>
              <input id="obs-search" className="input search__input" type="search" value={query} autoComplete="off"
                onChange={e => setQuery(e.target.value)} placeholder="Name suchen" enterKeyHint="search" />
            </div>
          )}
          <div className="chips obs-players" role="group" aria-label="Spieler:in">
            {shown.map(p => (
              <button key={p.id} type="button" className="chip" aria-pressed={pid === p.id} onClick={() => pick(p.id)}>{p.name}</button>
            ))}
            {shown.length === 0 && <p className="text-3">Niemand gefunden.</p>}
          </div>
        </div>
      )}
      <label htmlFor="obs-text" className="sr-only">Beobachtung</label>
      <textarea id="obs-text" ref={textRef} className="textarea" rows={3} value={text} onChange={e => setText(e.target.value)}
        placeholder={chosen ? `Was ist dir bei ${chosen.name} aufgefallen?` : "Erst Spieler:in wählen, dann kurz notieren"}
        data-autofocus={player ? "" : undefined} />
      {showTags
        ? <TagPicker value={tags} onChange={setTags} options={tagOptions} />
        : <button type="button" className="link-btn self-start" onClick={() => setShowTags(true)}>
            <Tags size={14} aria-hidden="true" /> {tags.length ? tags.join(", ") : "Thema zuordnen (optional)"}
          </button>}
    </Sheet>
  );
}

// Erfassen aus jeder Ansicht: const obs = useObservationCapture(...); obs.open({ teamId, date, players | player, … })
// Kontext: teamId, date, planId?, sessionId?, gameRef?, label?, onSaved?(beobachtung)
export function useObservationCapture({ update, me, tagOptions }) {
  const [ctx, setCtx] = useState(null);
  const [seq, setSeq] = useState(0);
  const open = c => { setCtx(c); setSeq(n => n + 1); };
  const sheet = ctx && (
    <ObservationSheet key={seq} open onClose={() => setCtx(null)} players={ctx.players ?? []} player={ctx.player ?? null}
      tagOptions={tagOptions} contextLabel={ctx.label}
      onSave={({ playerId, text, tags }) => {
        const o = newObservation({ teamId: ctx.teamId, date: ctx.date, planId: ctx.planId, sessionId: ctx.sessionId, gameRef: ctx.gameRef,
          playerId, text, tags, user: me, authorName: me?.name });
        update(d => addObservation(d, o));
        ctx.onSaved?.(o);
      }} />
  );
  return { open, sheet };
}

// Verlauf. playerName(id) → Name zeigen (Training/Team); sourceOf(o) → Herkunft („Training“), onOpen(o)
export function ObservationList({ items, playerName, sourceOf, onOpen, today, emptyText = "Noch keine Beobachtungen." }) {
  if (!items.length) return <p className="text-3">{emptyText}</p>;
  return (
    <ol className="list list-reset obs-list">
      {items.map(o => {
        const Tag = onOpen ? "button" : "div";
        return (
          <li key={o.id}>
            <Tag type={onOpen ? "button" : undefined} className={cx("row", "row--top", "obs")} onClick={onOpen ? () => onOpen(o) : undefined}>
              <span className="row__main">
                <span className="row__meta">
                  <Meta items={[fmtRelative(o.date, today), playerName?.(o.playerId), sourceOf?.(o), o.authorName]} />
                </span>
                <span className="obs__text">{o.text}</span>
                {o.tags?.length > 0 && (
                  <span className="obs__tags">{o.tags.map(t => <span key={t} className="tag">{t}</span>)}</span>
                )}
              </span>
            </Tag>
          </li>
        );
      })}
    </ol>
  );
}

// Einzelne Beobachtung: ganz lesen, zur Quelle springen; ändern/löschen nur eigene (der Server
// erzwingt das zusätzlich – Abteilungsleitung/Vereins-Admin dürfen dort ebenfalls)
export function ObservationDetail({ observation: o, onClose, canEdit, sourceLabel, onOpenSource, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(o?.text ?? "");
  if (!o) return null;
  return (
    <Sheet open onClose={onClose} title="Beobachtung"
      footer={editing
        ? <><Button variant="ghost" onClick={() => setEditing(false)}>Abbrechen</Button>
            <Button variant="primary" disabled={!text.trim()} onClick={() => { onSave(text.trim()); onClose(); }}>Speichern</Button></>
        : canEdit && <><Button variant="danger" onClick={onDelete}>Löschen</Button><Button onClick={() => setEditing(true)}>Bearbeiten</Button></>}>
      <p className="text-3"><Meta items={[fmtRelative(o.date), sourceLabel, o.authorName]} /></p>
      {editing
        ? <textarea className="textarea" rows={4} aria-label="Beobachtung" value={text} autoFocus onChange={e => setText(e.target.value)} />
        : <p className="prose">{o.text}</p>}
      {o.tags?.length > 0 && <span className="obs__tags">{o.tags.map(t => <span key={t} className="tag">{t}</span>)}</span>}
      {onOpenSource && !editing && <button type="button" className="link-btn self-start" onClick={onOpenSource}>{sourceLabel} öffnen</button>}
    </Sheet>
  );
}
