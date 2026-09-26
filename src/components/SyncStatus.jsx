import { useState } from "react";
import { CloudOff, RefreshCw, AlertTriangle, LogIn, CheckCircle2, LogOut, Cloud, ShieldAlert } from "lucide-react";
import { Button, Notice, Row, Section } from "./ui.jsx";
import { useConfirm } from "./confirm.jsx";
import { downloadBackup } from "../lib/io.js";
import { BY_NAME } from "../sync/mapping.js";

const COLL_LABEL = { sessions: "Training", plans: "Planung", seasons: "Saison", teams: "Team", players: "Spieler:in", training_types: "Trainingsart", venues: "Halle" };
const FIELD_LABEL = { note: "Notiz", focus: "Schwerpunkt", tags: "Themen", checklist: "Übungen", attendance: "Anwesenheit", date: "Datum", time: "Uhrzeit", name: "Name", durationMinutes: "Dauer" };

function ago(iso) {
  if (!iso) return "noch nie";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  return h < 24 ? `vor ${h} Std.` : new Date(iso).toLocaleDateString("de-DE");
}

function describe(sync) {
  const st = sync.status.state, n = sync.pendingCount;
  if (st === "syncing") return { tone: "info", icon: RefreshCw, text: "Wird synchronisiert …" };
  if (st === "offline") return { tone: "warning", icon: CloudOff, text: n ? `Offline – ${n} ${n === 1 ? "Änderung wartet" : "Änderungen warten"}` : "Offline – Daten auf diesem Gerät sind nutzbar" };
  if (st === "auth") return { tone: "warning", icon: LogIn, text: "Anmeldung abgelaufen" };
  if (st === "blocked") return { tone: "danger", icon: ShieldAlert, text: sync.status.message };
  if (st === "error") return { tone: "danger", icon: AlertTriangle, text: sync.status.message ?? "Sync fehlgeschlagen" };
  if (n) return { tone: "info", icon: Cloud, text: `${n} ${n === 1 ? "Änderung" : "Änderungen"} noch nicht übertragen` };
  return { tone: "success", icon: CheckCircle2, text: `Synchronisiert · ${ago(sync.meta.lastSync)}` };
}

// Hinweis oben in der App – nur wenn der Trainer etwas tun muss. Offline mit ausstehenden
// Änderungen ist Normalbetrieb in der Halle und erscheint nur in den Einstellungen.
export function SyncNotice({ sync, go }) {
  if (sync.mode !== "ready") return null;
  const st = sync.status.state;
  const conflicts = (sync.meta.conflicts ?? []).length;
  if (st === "auth") return (
    <div className="sync-notice"><Notice tone="warning" icon={LogIn}>
      Anmeldung abgelaufen – Änderungen bleiben auf dem Gerät.{" "}
      <button type="button" className="link-btn" onClick={() => sync.openRelogin()}>Anmelden</button>
    </Notice></div>
  );
  if (st === "blocked" || st === "error" || conflicts) return (
    <div className="sync-notice"><Notice tone={st === "blocked" ? "danger" : "warning"} icon={AlertTriangle}>
      {st === "blocked" ? sync.status.message : st === "error" ? sync.status.message : `${conflicts} ${conflicts === 1 ? "Änderung wurde" : "Änderungen wurden"} von anderer Stelle überholt.`}{" "}
      <button type="button" className="link-btn" onClick={() => go("settings", {}, { root: true })}>Ansehen</button>
    </Notice></div>
  );
  return null;
}

function conflictText(c) {
  const what = COLL_LABEL[c.coll] ?? c.coll;
  const date = c.local?.date ?? c.server?.date ?? c.localRecord?.date;
  const label = `${what}${date ? ` vom ${new Date(date + "T12:00:00").toLocaleDateString("de-DE")}` : ""}`;
  if (c.kind === "field") return `${label}: „${FIELD_LABEL[c.field] ?? c.field}“ wurde gleichzeitig anderswo geändert. Es gilt die andere Fassung.`;
  if (c.kind === "deleted-remote") return `${label} wurde anderswo gelöscht; deine ungesicherte Änderung ist hier aufbewahrt.`;
  if (c.kind === "delete-rejected") return `${label}: dein Löschen wurde nicht übernommen, weil es anderswo inzwischen geändert wurde.`;
  return `${label} gab es schon im Konto; es gilt die Fassung aus dem Konto.`;
}

// Abschnitt in den Einstellungen: Konto, Status, Konflikte, Abmelden – keine Sync-Konsole.
export function SyncSection({ sync }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const d = describe(sync);
  const conflicts = sync.meta.conflicts ?? [];
  const org = (sync.data.organizations ?? []).find(o => o.id === sync.meta.organizationId);
  const section = (sync.data.sections ?? []).find(s => s.id === sync.meta.sectionId);

  async function syncNow() { setBusy(true); try { await sync.sync(); } finally { setBusy(false); } }
  async function logout() {
    const r = await sync.logout();
    if (!r.pending) return;
    if (!(await confirm({ title: "Trotzdem abmelden?", danger: true, confirmLabel: "Sichern und abmelden",
      text: `${r.pending} ${r.pending === 1 ? "Änderung ist" : "Änderungen sind"} noch nicht auf dem Server. Sie werden als Backup-Datei gespeichert, danach werden die Daten von diesem Gerät entfernt.` }))) return;
    downloadBackup(sync.data);
    await sync.logout({ force: true });
  }

  return (
    <Section title="Konto & Synchronisation">
      <div className="list">
        <div className="row">
          <span className="row__main">
            <span className="row__title">{sync.meta.user?.name || sync.meta.user?.email}</span>
            <span className="row__meta">{[sync.meta.user?.email, org?.name, section?.name].filter(Boolean).join(" · ")}</span>
          </span>
          <Button size="sm" variant="ghost" icon={LogOut} onClick={logout}>Abmelden</Button>
        </div>
        <div className={`row tone-${d.tone}`}>
          <span className="row__lead"><d.icon size={20} aria-hidden="true" /></span>
          <span className="row__main"><span className="row__title" role="status">{d.text}</span></span>
          {sync.status.state === "auth"
            ? <Button size="sm" onClick={() => sync.openRelogin()}>Anmelden</Button>
            : <Button size="sm" onClick={syncNow} disabled={busy || sync.status.state === "syncing"}>Jetzt</Button>}
        </div>
      </div>

      {sync.status.state === "blocked" && (
        <Notice tone="danger" icon={ShieldAlert}>
          Es würden ungewöhnlich viele Einträge auf dem Server gelöscht. Bitte bestätigen oder wiederherstellen.
          <span className="btn-row">
            <Button size="sm" onClick={() => sync.restoreHeld()}>Wiederherstellen</Button>
            <Button size="sm" variant="danger-solid" onClick={() => sync.confirmMassDelete()}>Löschen bestätigen</Button>
          </span>
        </Notice>
      )}

      {(sync.meta.errors ?? []).length > 0 && (
        <p className="field__hint">Nicht übertragen: {sync.meta.errors.map(e => `${COLL_LABEL[e.coll] ?? e.coll} (${e.message})`).join(", ")}</p>
      )}

      {conflicts.length > 0 && (
        <div className="list">
          {conflicts.map((c, i) => (
            <Row key={`${c.coll}-${c.id}-${c.at}-${i}`} title={conflictText(c)}
              trail={<span className="btn-row">
                {BY_NAME[c.coll] && c.kind !== "delete-rejected" && (c.localRecord || c.local) &&
                  <Button size="sm" onClick={() => sync.resolveConflict(i, "mine")}>Meine Fassung</Button>}
                <Button size="sm" variant="ghost" onClick={() => sync.resolveConflict(i, "dismiss")}>OK</Button>
              </span>} />
          ))}
        </div>
      )}
      <p className="field__hint">Änderungen werden automatisch übertragen, sobald das Gerät online ist – auch nach einem Training ohne Empfang.</p>
    </Section>
  );
}
