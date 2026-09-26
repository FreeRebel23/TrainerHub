// Bausteine, die beim Erfassen und beim Bearbeiten einer Einheit gleich funktionieren.
import { useState } from "react";
import { Check, Plus, ChevronDown, Minus, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { STATUSES, STATUS_KEYS } from "../lib/constants.js";
import { isPresent, uid } from "../lib/data.js";
import { moveItem, normalizeTags } from "../lib/training.js";
import { cx, IconButton } from "./ui.jsx";

// Antippen schaltet zwischen dabei / nicht dabei. Verletzte werden automatisch
// als "verletzt – trotzdem da" bzw. "verletzt – nicht da" geführt (wie bisher).
export function quickToggle(status, injured) {
  return isPresent(status)
    ? (injured ? "injured_absent" : "absent")
    : (injured ? "injured_present" : "present");
}

function StatusMark({ status }) {
  const on = isPresent(status);
  if (on) return <span className="att-mark att-mark--on"><Check size={18} strokeWidth={2.5} aria-hidden="true" /></span>;
  if (status === "absent") return <span className="att-mark" />;
  return <span className="att-mark att-mark--off"><Minus size={16} aria-hidden="true" /></span>;
}

// rows: [{ playerId, status }], players: Map/Funktion für Name + injured
export function AttendanceList({ rows, getPlayer, onChange }) {
  const [open, setOpen] = useState(null);

  return (
    <div className="list">
      {rows.map(a => {
        const player = getPlayer(a.playerId);
        const s = STATUSES[a.status] ?? STATUSES.absent;
        const isOpen = open === a.playerId;
        const name = player?.name ?? "Unbekannt";
        return (
          // "Fehlt" ist der Ausgangszustand beim Erfassen – neutral statt rot darstellen
          <div key={a.playerId} className={cx("att-row", `tone-${a.status === "absent" ? "muted" : s.tone}`)}>
            <div className="att-row__main">
              <button type="button" className="att-row__toggle"
                aria-pressed={isPresent(a.status)} aria-label={`${name}: ${s.label}`}
                onClick={() => { onChange(a.playerId, quickToggle(a.status, player?.injured)); setOpen(null); }}>
                <StatusMark status={a.status} />
                <span className="row__main">
                  <span className="att-row__name">{name}</span>
                  <span className="att-row__status">{s.label}</span>
                </span>
              </button>
              <IconButton icon={ChevronDown} label={`Status für ${name} wählen`}
                aria-expanded={isOpen}
                className={isOpen ? "chev-rotate" : undefined}
                onClick={() => setOpen(isOpen ? null : a.playerId)} />
            </div>
            {isOpen && (
              <div className="att-options expand" role="group" aria-label={`Status für ${name}`}>
                {STATUS_KEYS.map(key => {
                  const opt = STATUSES[key];
                  return (
                    <button key={key} type="button" className={cx("att-option", `tone-${opt.tone}`)}
                      aria-pressed={a.status === key}
                      onClick={() => { onChange(a.playerId, key); setOpen(null); }}>
                      <span className="dot" />
                      {opt.label}
                      {opt.factorMult > 0 && <span className="att-option__factor">×{String(opt.factorMult).replace(".", ",")}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Übungen einer Einheit.
//  checkable – abhaken (Durchführen, Trainingsdetail)
//  editable  – Übung antippen öffnet Bearbeitung: Name, Dauer, Beschreibung, Reihenfolge, Entfernen
//  addable   – Eingabezeile zum Hinzufügen (auch spontan während des Trainings)
export function DrillList({ items, onChange, checkable = true, editable = true, addable = editable, autoFocus = false }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(null);

  function add() {
    const t = text.trim();
    if (!t) return;
    onChange([...items, { id: uid(), text: t, done: false }]);
    setText("");
  }
  const patch = (id, p) => onChange(items.map(d => d.id === id ? { ...d, ...p } : d));
  const toggle = id => patch(id, { done: !items.find(d => d.id === id)?.done });
  const remove = id => { onChange(items.filter(d => d.id !== id)); setOpen(null); };
  const move = (i, delta) => onChange(moveItem(items, i, delta));

  return (
    <div className="list">
      {items.map((d, i) => {
        const isOpen = editable && open === d.id;
        const main = (
          <span className="drill-row__main">
            <span className={cx("drill-row__text", checkable && d.done && "drill-row__text--done")}>
              {editable && <span className="drill-row__index" aria-hidden="true">{i + 1}.</span>}
              {d.text || <span className="text-3">Ohne Namen</span>}
            </span>
            {d.note && !isOpen && <span className="drill-row__note">{d.note}</span>}
          </span>
        );
        return (
          <div key={d.id} className={cx("drill", isOpen && "drill--open")}>
            <div className="drill-row">
              {checkable && (
                <button type="button" className={cx("check", d.done && "check--on")} aria-pressed={!!d.done}
                  aria-label={`${d.text} ${d.done ? "als offen markieren" : "abhaken"}`} onClick={() => toggle(d.id)}>
                  {d.done && <Check size={14} strokeWidth={3} aria-hidden="true" />}
                </button>
              )}
              {editable ? (
                <button type="button" className="drill-row__edit" aria-expanded={isOpen}
                  aria-label={`${d.text}${d.minutes ? `, ${d.minutes} Minuten` : ""} bearbeiten`}
                  onClick={() => setOpen(isOpen ? null : d.id)}>
                  {main}
                  {d.minutes > 0 && <span className="drill-row__min num">{d.minutes}′</span>}
                  <ChevronDown size={18} className={cx("drill-row__chev", isOpen && "chev-rotate")} aria-hidden="true" />
                </button>
              ) : (<>
                {main}
                {d.minutes > 0 && <span className="drill-row__min num">{d.minutes}′</span>}
              </>)}
            </div>
            {isOpen && (
              <div className="drill-editor expand">
                <div className="drill-editor__grid">
                  <label className="sr-only" htmlFor={`dn-${d.id}`}>Name der Übung</label>
                  <input id={`dn-${d.id}`} className="input" value={d.text} placeholder="Name der Übung"
                    onChange={e => patch(d.id, { text: e.target.value })} />
                  <label className="sr-only" htmlFor={`dm-${d.id}`}>Dauer in Minuten</label>
                  <div className="input-suffix">
                    <input id={`dm-${d.id}`} className="input num" inputMode="numeric" pattern="[0-9]*" placeholder="–"
                      value={d.minutes ?? ""} maxLength={3}
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, "");
                        patch(d.id, { minutes: v ? Number(v) : undefined });
                      }} />
                    <span aria-hidden="true">min</span>
                  </div>
                </div>
                <label className="sr-only" htmlFor={`dd-${d.id}`}>Beschreibung</label>
                <textarea id={`dd-${d.id}`} className="textarea textarea--compact" rows={2} value={d.note ?? ""}
                  placeholder="Beschreibung, Coaching-Punkte (optional)"
                  onChange={e => patch(d.id, { note: e.target.value || undefined })} />
                <div className="drill-editor__actions">
                  <IconButton icon={ArrowUp} label="Nach oben" disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton icon={ArrowDown} label="Nach unten" disabled={i === items.length - 1} onClick={() => move(i, 1)} />
                  <span className="drill-editor__spacer" />
                  <IconButton icon={Trash2} label={`${d.text || "Übung"} entfernen`} variant="danger" onClick={() => remove(d.id)} />
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(null)}>Fertig</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {addable && (
        <div className="drill-add">
          <label htmlFor="drill-input" className="sr-only">Übung hinzufügen</label>
          <input id="drill-input" className="input" value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder={items.length ? "Weitere Übung hinzufügen" : "Übung hinzufügen, z. B. Shell Drill 4 gegen 4"}
            enterKeyHint="done" autoFocus={autoFocus} />
          <IconButton icon={Plus} label="Übung hinzufügen" variant="accent" onClick={add} disabled={!text.trim()} />
        </div>
      )}
    </div>
  );
}

// Themen (Tags): Mehrfachauswahl aus bekannten Themen plus eigene
export function TagPicker({ value, onChange, options }) {
  const [custom, setCustom] = useState("");
  const selected = new Set(value.map(t => t.toLocaleLowerCase("de")));
  const shown = normalizeTags([...value, ...options]).slice(0, Math.max(14, value.length));
  const toggle = t => selected.has(t.toLocaleLowerCase("de"))
    ? onChange(value.filter(v => v.toLocaleLowerCase("de") !== t.toLocaleLowerCase("de")))
    : onChange(normalizeTags([...value, t]));
  function addCustom() {
    const t = custom.trim();
    if (!t) return;
    // Bekanntes Thema in anderer Schreibweise ("wurf") → bestehende Schreibweise ("Wurf") verwenden
    const known = options.find(o => o.toLocaleLowerCase("de") === t.toLocaleLowerCase("de"));
    onChange(normalizeTags([...value, known ?? t]));
    setCustom("");
  }
  return (
    <div className="tag-picker">
      <div className="chips" role="group" aria-label="Themen">
        {shown.map(t => (
          <button key={t} type="button" className="chip chip--sm" aria-pressed={selected.has(t.toLocaleLowerCase("de"))} onClick={() => toggle(t)}>
            {t}
          </button>
        ))}
      </div>
      <div className="tag-picker__add">
        <label htmlFor="tag-input" className="sr-only">Eigenes Thema</label>
        <input id="tag-input" className="input" value={custom} placeholder="Eigenes Thema"
          onChange={e => setCustom(e.target.value)} enterKeyHint="done"
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }} />
        <IconButton icon={Plus} label="Thema hinzufügen" variant="accent" onClick={addCustom} disabled={!custom.trim()} />
      </div>
    </div>
  );
}

// Kompakte Themen-Anzeige
export function TagList({ tags }) {
  if (!tags?.length) return null;
  return (
    <ul className="tag-list" aria-label="Themen">
      {tags.map(t => <li key={t} className="tag">{t}</li>)}
    </ul>
  );
}
