// Bausteine, die beim Erfassen und beim Bearbeiten einer Einheit gleich funktionieren.
import { useState } from "react";
import { Check, X, Plus, ChevronDown, Minus } from "lucide-react";
import { STATUSES, STATUS_KEYS } from "../lib/constants.js";
import { isPresent, uid } from "../lib/data.js";
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

// Übungen/Drills als abhakbare Liste
export function DrillList({ items, onChange, editable = true, autoFocus = false }) {
  const [text, setText] = useState("");

  function add() {
    const t = text.trim();
    if (!t) return;
    onChange([...items, { id: uid(), text: t, done: false }]);
    setText("");
  }
  const toggle = id => onChange(items.map(d => d.id === id ? { ...d, done: !d.done } : d));
  const remove = id => onChange(items.filter(d => d.id !== id));

  return (
    <div className="list">
      {items.map(d => (
        <div key={d.id} className="drill-row">
          <button type="button" className={cx("check", d.done && "check--on")} aria-pressed={d.done}
            aria-label={`${d.text} ${d.done ? "als offen markieren" : "abhaken"}`} onClick={() => toggle(d.id)}>
            {d.done && <Check size={14} strokeWidth={3} aria-hidden="true" />}
          </button>
          <span className={cx("drill-row__text", d.done && "drill-row__text--done")}>{d.text}</span>
          {editable && <IconButton icon={X} size={18} label={`${d.text} entfernen`} onClick={() => remove(d.id)} />}
        </div>
      ))}
      {editable && (
        <div className="drill-add">
          <label htmlFor="drill-input" className="sr-only">Übung hinzufügen</label>
          <input id="drill-input" className="input" value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="Übung hinzufügen, z. B. Shell Drill 4 gegen 4" enterKeyHint="done" autoFocus={autoFocus} />
          <IconButton icon={Plus} label="Übung hinzufügen" variant="accent" onClick={add} disabled={!text.trim()} />
        </div>
      )}
    </div>
  );
}
