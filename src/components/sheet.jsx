// Bottom Sheet im App-Design (mobil im Daumenbereich, Desktop zentriert) auf Basis des nativen
// <dialog> wie der Bestätigungsdialog: Fokusfalle, Escape und Hintergrund-Sperre liefert der Browser.
// showModal() setzt den Fokus auf das erste bedienbare Element (Schließen) – ein Feld mit
// data-autofocus bekommt ihn danach ausdrücklich (Reacts autoFocus greift hier nicht).
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { IconButton, cx } from "./ui.jsx";

export function Sheet({ open, onClose, title, children, footer, className, labelledBy = "sheet-title" }) {
  const ref = useRef(null);
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
      dlg.querySelector("[data-autofocus]")?.focus();
    }
    if (!open && dlg.open) dlg.close();
  }, [open]);
  if (!open) return null;
  return (
    <dialog ref={ref} className={cx("dialog", "sheet", className)} aria-labelledby={labelledBy}
      onCancel={e => { e.preventDefault(); onClose(); }}
      onClick={e => { if (e.target === ref.current) onClose(); }}>
      <div className="dialog__body sheet__body">
        <div className="sheet__head">
          <h2 id={labelledBy} className="dialog__title">{title}</h2>
          <IconButton icon={X} label="Schließen" onClick={onClose} />
        </div>
        <div className="sheet__content">{children}</div>
        {footer && <div className="dialog__actions sheet__footer">{footer}</div>}
      </div>
    </dialog>
  );
}
