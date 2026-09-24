// Bestätigungsdialog im App-Design statt window.confirm (das in der installierten PWA
// die Domain als Titel zeigt). Basiert auf dem nativen <dialog>: Fokusfalle, Escape
// und Hintergrund-Sperre liefert der Browser.
//
//   const confirm = useConfirm();
//   if (!(await confirm({ title, text, confirmLabel: "Löschen", danger: true }))) return;

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Button } from "./ui.jsx";

const ConfirmContext = createContext(async () => false);

export function useConfirm() { return useContext(ConfirmContext); }

export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);   // { title, text, confirmLabel, danger, resolve }
  const ref = useRef(null);

  const confirm = useCallback(opts => new Promise(resolve => setReq({ ...opts, resolve })), []);

  useEffect(() => {
    const dlg = ref.current;
    if (req && dlg && !dlg.open) dlg.showModal();
  }, [req]);

  function close(result) {
    ref.current?.close();
    req?.resolve(result);
    setReq(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {req && (
        <dialog ref={ref} className="dialog" aria-labelledby="confirm-title" aria-describedby="confirm-text"
          onCancel={e => { e.preventDefault(); close(false); }}
          onClick={e => { if (e.target === ref.current) close(false); }}>
          <div className="dialog__body">
            <h2 id="confirm-title" className="dialog__title">{req.title}</h2>
            {req.text && <p id="confirm-text" className="dialog__text">{req.text}</p>}
            <div className="dialog__actions">
              {/* Fokus bewusst auf "Abbrechen": Enter löscht nie versehentlich */}
              <Button variant="secondary" onClick={() => close(false)} autoFocus>Abbrechen</Button>
              <Button variant={req.danger ? "danger-solid" : "primary"} onClick={() => close(true)}>
                {req.confirmLabel ?? "OK"}
              </Button>
            </div>
          </div>
        </dialog>
      )}
    </ConfirmContext.Provider>
  );
}
