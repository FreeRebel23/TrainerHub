import { useEffect, useState } from "react";
import { LogIn, WifiOff, CloudUpload, Server, Download, AlertTriangle } from "lucide-react";
import { Button, Field, Notice, Section, ChoiceChips } from "../components/ui.jsx";
import { downloadBackup } from "../lib/io.js";
import { hasLocalContent } from "../sync/legacy.js";

function loginError(err) {
  if (err?.kind === "offline") return "Keine Verbindung zum Server. Für die erste Anmeldung ist Internet nötig.";
  if (err?.kind === "ratelimit") return "Zu viele Versuche – bitte kurz warten.";
  if (err?.status === 400) return "E-Mail oder Passwort stimmen nicht.";
  return err?.message ?? "Anmeldung fehlgeschlagen.";
}

// Anmeldung – bewusst schlicht, im Stil der App. Kein Registrieren: Konten legt der Verein an.
export function LoginView({ sync }) {
  const relogin = !!sync.meta.user;
  const [email, setEmail] = useState(sync.meta.user?.email ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  const localData = !relogin && hasLocalContent(sync.data);

  useEffect(() => {
    const on = () => setOffline(false), off = () => setOffline(true);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setBusy(true); setError(null);
    try { await sync.login(email, password); }
    catch (err) { setError(loginError(err)); }
    finally { setBusy(false); }
  }

  return (
    <div className="auth">
      <form className="auth__card" onSubmit={submit} noValidate>
        <div className="auth__brand">
          <span className="brand-mark" aria-hidden="true">TH</span>
          <h1 className="auth__title">TrainerHub</h1>
        </div>
        {relogin && <p className="field__hint">Deine Anmeldung ist abgelaufen. Deine Daten auf diesem Gerät bleiben erhalten.</p>}
        {offline && <Notice tone="warning" icon={WifiOff}>Du bist offline. Zum Anmelden wird kurz Internet benötigt.</Notice>}
        <Field label="E-Mail" htmlFor="login-email">
          <input id="login-email" className="input" type="email" autoComplete="username" inputMode="email"
            value={email} onChange={e => setEmail(e.target.value)} autoFocus={!email} autoCapitalize="none" />
        </Field>
        <Field label="Passwort" htmlFor="login-password">
          <input id="login-password" className="input" type="password" autoComplete="current-password"
            value={password} onChange={e => setPassword(e.target.value)} autoFocus={!!email} />
        </Field>
        {error && <Notice tone="danger" icon={AlertTriangle}><span role="alert">{error}</span></Notice>}
        <Button variant="primary" size="lg" type="submit" icon={LogIn} disabled={busy || !email.trim() || !password}>
          {busy ? "Anmelden …" : "Anmelden"}
        </Button>
        {relogin && (
          <button type="button" className="link-btn self-start" onClick={() => sync.cancelRelogin()}>Später – offline weiterarbeiten</button>
        )}
        {localData && (
          <p className="field__hint">
            Auf diesem Gerät liegen bereits Trainingsdaten. Nach der Anmeldung kannst du sie in dein Konto übernehmen.{" "}
            <button type="button" className="link-btn" onClick={() => sync.continueLocal()}>Ohne Anmeldung weiterarbeiten</button>
          </p>
        )}
        <p className="footnote">Noch kein Zugang? Deine Vereins-Administration legt ihn an.</p>
      </form>
    </div>
  );
}

const fmt = s => [
  `${s.teams} ${s.teams === 1 ? "Team" : "Teams"}`, `${s.players} Spieler:innen`,
  `${s.sessions} Trainings`, `${s.plans} Planungen`, s.seasons ? `${s.seasons} Saisons` : null,
].filter(Boolean).join(" · ");

// Erstübernahme eines bisher lokalen Gerätestands in das Konto. Nie ungefragt überschreiben:
// Server leer → übernehmen. Server hat Daten → bewusst wählen: ergänzen oder Serverstand nutzen.
export function MigrationView({ sync }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [choice, setChoice] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    sync.inspectMigration().then(i => { if (alive) { setInfo(i); setChoice(i.serverEmpty ? "upload" : "merge"); } })
      .catch(err => alive && setError(err?.kind === "offline" ? "Keine Verbindung zum Server – bitte online erneut versuchen." : err.message));
    return () => { alive = false; };
  }, [sync]);

  async function run() {
    setBusy(true); setError(null);
    try {
      if (choice === "server") downloadBackup(sync.data);   // lokale Daten vorher als Datei sichern
      await sync.completeMigration(choice, { inspection: info });
    } catch (err) { setError(err.message); setBusy(false); }
  }

  const matched = info ? Object.values(info.matched ?? {}).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="auth">
      <div className="auth__card auth__card--wide">
        <h1 className="auth__title">Daten übernehmen</h1>
        <p className="field__hint">Angemeldet als {sync.meta.user?.email}{info?.target ? ` · ${info.target}` : ""}</p>
        {!info && !error && <p className="text-3">Prüfe den Stand auf dem Server …</p>}
        {error && <Notice tone="danger" icon={AlertTriangle}>{error}</Notice>}
        {info && (<>
          <Section title="Auf diesem Gerät"><p>{fmt(info.local)}</p></Section>
          <Section title="Bereits im Konto"><p>{info.serverEmpty ? "Noch keine Teams und Trainings." : fmt(info.server)}</p></Section>
          {info.serverEmpty ? (
            <p className="field__hint">Deine Daten werden in dein Konto übertragen und sind danach auf allen deinen Geräten verfügbar.</p>
          ) : (<>
            <ChoiceChips label="Vorgehen" value={choice} onChange={setChoice} options={[
              { value: "merge", label: "Zusammenführen" }, { value: "server", label: "Serverstand verwenden" },
            ]} />
            <p className="field__hint">
              {choice === "merge"
                ? `Nur Neues wird ergänzt, nichts auf dem Server überschrieben.${matched ? ` ${matched} gleichnamige Teams, Spieler:innen, Trainingsarten bzw. Hallen werden als dieselben erkannt.` : ""}`
                : "Die Daten auf diesem Gerät werden zuerst als Backup-Datei gespeichert und dann durch den Serverstand ersetzt."}
            </p>
          </>)}
          <div className="btn-row">
            <Button variant="primary" size="lg" icon={choice === "server" ? Server : CloudUpload} disabled={busy} onClick={run}>
              {busy ? "Übertrage …" : info.serverEmpty ? "Daten übernehmen" : choice === "merge" ? "Zusammenführen" : "Serverstand verwenden"}
            </Button>
            <Button variant="ghost" icon={Download} onClick={() => downloadBackup(sync.data)}>Backup speichern</Button>
          </div>
        </>)}
        <button type="button" className="link-btn self-start" onClick={() => sync.logout({ force: false, keepLocal: true })}>Abbrechen und abmelden</button>
      </div>
    </div>
  );
}
