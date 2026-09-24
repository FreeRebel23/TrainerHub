import { useState } from "react";
import {
  Pencil, Trash2, Plus, Send, Inbox, FileSpreadsheet, Upload, Download, HardDriveDownload,
  HardDriveUpload, RefreshCw, Monitor, Sun, Moon, Smartphone, CheckCircle2, AlertCircle,
} from "lucide-react";
import { TYPE_DURATIONS } from "../lib/constants.js";
import { uid, calcFactor } from "../lib/data.js";
import {
  exportSync, importSync, mySessions, exportAttendanceXLSX, downloadPlanTemplate,
  importTrainingPlan, downloadBackup, readBackup,
} from "../lib/io.js";
import {
  Button, IconButton, PageIntro, Section, Row, Meta, Field, ChoiceChips, Segmented, Notice,
} from "../components/ui.jsx";
import { useConfirm } from "../components/confirm.jsx";

// Datei-Eingabe als Listenzeile (Label umschließt das versteckte input)
function FileRow({ icon: Icon, title, meta, accept, onFile }) {
  return (
    <label className="row file-row">
      <span className="row__lead"><Icon size={20} aria-hidden="true" /></span>
      <span className="row__main">
        <span className="row__title">{title}</span>
        {meta && <span className="row__meta">{meta}</span>}
      </span>
      <input type="file" accept={accept} className="sr-only" onChange={e => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        e.target.value = "";
      }} />
    </label>
  );
}

function Result({ msg }) {
  if (!msg) return null;
  return (
    <Notice tone={msg.ok ? "success" : "warning"} icon={msg.ok ? CheckCircle2 : AlertCircle}>
      <span role="status">{msg.text}</span>
    </Notice>
  );
}

// Formular für Trainingsart bzw. Halle
function TypeForm({ val, onChange, onSave, onCancel, submitLabel }) {
  return (
    <form className="card form expand" onSubmit={e => { e.preventDefault(); onSave(); }}>
      <Field label="Name" htmlFor="tt-name">
        <input id="tt-name" className="input" value={val.name} autoFocus autoComplete="off"
          onChange={e => onChange({ ...val, name: e.target.value })} placeholder="z. B. Wurftraining" />
      </Field>
      <Field label="Standarddauer" aside={`Faktor ${String(calcFactor(val.duration)).replace(".", ",")}`}>
        <ChoiceChips label="Standarddauer" value={val.duration} onChange={v => onChange({ ...val, duration: v })}
          options={TYPE_DURATIONS.map(m => ({ value: m, label: `${m} min` }))} />
      </Field>
      <div className="btn-row">
        <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
        <Button variant="primary" type="submit" disabled={!val.name?.trim()}>{submitLabel}</Button>
      </div>
    </form>
  );
}

function VenueForm({ val, onChange, onSave, onCancel, submitLabel }) {
  return (
    <form className="card form expand" onSubmit={e => { e.preventDefault(); onSave(); }}>
      <Field label="Name" htmlFor="v-name">
        <input id="v-name" className="input" value={val.name} autoFocus autoComplete="off"
          onChange={e => onChange({ ...val, name: e.target.value })} placeholder="Hallenname" />
      </Field>
      <Field label="Adresse / Kurzbezeichnung" htmlFor="v-addr">
        <input id="v-addr" className="input" value={val.address} autoComplete="off"
          onChange={e => onChange({ ...val, address: e.target.value })} />
      </Field>
      <div className="btn-row">
        <Button variant="ghost" onClick={onCancel}>Abbrechen</Button>
        <Button variant="primary" type="submit" disabled={!val.name?.trim()}>{submitLabel}</Button>
      </div>
    </form>
  );
}

export function SettingsView({ data, update, pwa, theme }) {
  const teams = data.teams ?? [];
  // Trainingsarten
  const [typeEdit, setTypeEdit]   = useState(null);   // id | "new" | null
  const [typeDraft, setTypeDraft] = useState({});
  // Hallen
  const [venueEdit, setVenueEdit]   = useState(null);
  const [venueDraft, setVenueDraft] = useState({});
  // Datenaustausch
  const [syncMsg, setSyncMsg] = useState(null);
  const [expTid, setExpTid]   = useState(teams[0]?.id ?? "");
  const [expSid, setExpSid]   = useState("all");
  const [impTid, setImpTid]   = useState(teams[0]?.id ?? "");
  const [impMsg, setImpMsg]   = useState(null);
  const [backupMsg, setBackupMsg] = useState(null);
  const confirm = useConfirm();

  // ─── Trainingsarten ───
  function saveType() {
    const name = typeDraft.name?.trim();
    if (!name) return;
    if (typeEdit === "new") {
      update(d => ({ ...d, trainingTypes: [...d.trainingTypes, { id: uid(), ...typeDraft, name }] }));
    } else {
      update(d => ({ ...d, trainingTypes: d.trainingTypes.map(t => t.id !== typeEdit ? t : { ...t, ...typeDraft, name }) }));
    }
    setTypeEdit(null);
  }
  async function deleteType(type) {
    if ((data.sessions ?? []).some(s => s.trainingTypeId === type.id)) return;
    if (!(await confirm({ title: `Trainingsart „${type.name}“ löschen?`, confirmLabel: "Löschen", danger: true }))) return;
    update(d => ({ ...d, trainingTypes: d.trainingTypes.filter(t => t.id !== type.id) }));
  }

  // ─── Hallen ───
  function saveVenue() {
    const name = venueDraft.name?.trim();
    if (!name) return;
    if (venueEdit === "new") {
      update(d => ({ ...d, venues: [...(d.venues ?? []), { id: uid(), ...venueDraft, name }] }));
    } else {
      update(d => ({ ...d, venues: d.venues.map(v => v.id !== venueEdit ? v : { ...v, ...venueDraft, name }) }));
    }
    setVenueEdit(null);
  }
  async function deleteVenue(venue) {
    if (!(await confirm({ title: `Halle „${venue.name}“ löschen?`, confirmLabel: "Löschen", danger: true }))) return;
    update(d => ({ ...d, venues: d.venues.filter(v => v.id !== venue.id) }));
  }

  const trainerName = data.settings?.trainerName ?? "";
  const mine = mySessions(data).length;

  return (
    <div className="page">
      <PageIntro title="Einstellungen" />
      <div className="page-body">

        <Section title="Darstellung">
          <Segmented label="Farbschema" block value={theme.pref} onChange={theme.setPref} options={[
            { value: "system", label: "System", icon: Monitor },
            { value: "light",  label: "Hell",   icon: Sun },
            { value: "dark",   label: "Dunkel", icon: Moon },
          ]} />
        </Section>

        <Section title="Profil">
          <Field label="Dein Name" htmlFor="trainer-name" hint="Wird in jedem erfassten Training und im Sync-Paket vermerkt.">
            <input id="trainer-name" className="input" value={trainerName} autoComplete="name" placeholder="z. B. Florian"
              onChange={e => update(d => ({ ...d, settings: { ...(d.settings ?? {}), trainerName: e.target.value } }))} />
          </Field>
        </Section>

        <Section title="Trainingsarten">
          <div className="list">
            {(data.trainingTypes ?? []).map(type => {
              const usedIn = (data.sessions ?? []).filter(s => s.trainingTypeId === type.id).length;
              if (typeEdit === type.id) return (
                <div key={type.id} className="form-slot">
                  <TypeForm val={typeDraft} onChange={setTypeDraft} onSave={saveType} onCancel={() => setTypeEdit(null)} submitLabel="Speichern" />
                </div>
              );
              return (
                <Row key={type.id}
                  title={type.name}
                  meta={<Meta items={[`${type.duration} min`, usedIn > 0 && `${usedIn}× verwendet`]} />}
                  trail={<>
                    <IconButton icon={Pencil} size={18} label={`${type.name} bearbeiten`}
                      onClick={() => { setTypeEdit(type.id); setTypeDraft({ ...type }); }} />
                    <IconButton icon={Trash2} size={18} variant="danger" disabled={usedIn > 0}
                      label={usedIn > 0 ? `${type.name} wird verwendet und kann nicht gelöscht werden` : `${type.name} löschen`}
                      onClick={() => deleteType(type)} />
                  </>} />
              );
            })}
          </div>
          {typeEdit === "new"
            ? <TypeForm val={typeDraft} onChange={setTypeDraft} onSave={saveType} onCancel={() => setTypeEdit(null)} submitLabel="Hinzufügen" />
            : <Button icon={Plus} className="self-start" onClick={() => { setTypeEdit("new"); setTypeDraft({ name: "", duration: 90 }); }}>Trainingsart</Button>}
        </Section>

        <Section title="Hallen">
          <div className="list">
            {(data.venues ?? []).map(venue => {
              const usedIn = (data.sessions ?? []).filter(s => s.venueId === venue.id).length
                           + (data.plannedSessions ?? []).filter(p => p.venueId === venue.id).length;
              if (venueEdit === venue.id) return (
                <div key={venue.id} className="form-slot">
                  <VenueForm val={venueDraft} onChange={setVenueDraft} onSave={saveVenue} onCancel={() => setVenueEdit(null)} submitLabel="Speichern" />
                </div>
              );
              return (
                <Row key={venue.id}
                  title={venue.name}
                  meta={<Meta items={[venue.address, usedIn > 0 && `${usedIn}× genutzt`]} />}
                  trail={<>
                    <IconButton icon={Pencil} size={18} label={`${venue.name} bearbeiten`}
                      onClick={() => { setVenueEdit(venue.id); setVenueDraft({ ...venue }); }} />
                    <IconButton icon={Trash2} size={18} variant="danger" disabled={usedIn > 0}
                      label={usedIn > 0 ? `${venue.name} wird verwendet und kann nicht gelöscht werden` : `${venue.name} löschen`}
                      onClick={() => deleteVenue(venue)} />
                  </>} />
              );
            })}
          </div>
          {venueEdit === "new"
            ? <VenueForm val={venueDraft} onChange={setVenueDraft} onSave={saveVenue} onCancel={() => setVenueEdit(null)} submitLabel="Hinzufügen" />
            : <Button icon={Plus} className="self-start" onClick={() => { setVenueEdit("new"); setVenueDraft({ name: "", address: "" }); }}>Halle</Button>}
        </Section>

        <Section title="Mit anderen Trainer:innen abgleichen">
          <p className="field__hint">
            Jede:r arbeitet in der eigenen App. Zum Abgleich die Sync-Datei senden (z. B. per WhatsApp);
            die andere Person importiert sie über „Sync empfangen“. Nur neue Trainings werden übernommen.
          </p>
          <div className="list">
            <Row lead={<Send size={20} aria-hidden="true" />}
              title="Sync senden"
              meta={`Meine Trainings (${mine}) als Datei exportieren`}
              onClick={() => {
                if (!trainerName.trim()) { setSyncMsg({ ok: false, text: "Bitte zuerst oben deinen Namen eintragen." }); return; }
                const n = exportSync(data);
                setSyncMsg({ ok: true, text: `${n} Trainings exportiert.` });
              }} />
            <FileRow icon={Inbox} title="Sync empfangen" meta="Sync-Datei (.json) importieren" accept=".json"
              onFile={f => importSync(f, data, update, (n, from) => {
                if (n < 0) setSyncMsg({ ok: false, text: "Fehler: " + from });
                else if (n === 0) setSyncMsg({ ok: true, text: "Keine neuen Trainings in der Datei." });
                else setSyncMsg({ ok: true, text: `${n} neue Trainings von ${from} importiert.` });
              })} />
          </div>
          <Result msg={syncMsg} />
        </Section>

        <Section title="Anwesenheitsliste (Excel)">
          <div className="card form">
            {teams.length > 1 && (
              <Field label="Team">
                <ChoiceChips label="Team" value={expTid} onChange={v => { setExpTid(v); setExpSid("all"); }}
                  options={teams.map(t => ({ value: t.id, label: t.name }))} />
              </Field>
            )}
            {(data.seasons ?? []).some(s => s.teamId === expTid) && (
              <Field label="Saison">
                <ChoiceChips label="Saison" value={expSid} onChange={setExpSid}
                  options={[{ value: "all", label: "Gesamt" }, ...(data.seasons ?? []).filter(s => s.teamId === expTid).map(s => ({ value: s.id, label: s.name }))]} />
              </Field>
            )}
            <Button icon={FileSpreadsheet} className="self-start" onClick={() => exportAttendanceXLSX(data, expTid, expSid)} disabled={!expTid}>
              Excel herunterladen
            </Button>
          </div>
        </Section>

        <Section title="Trainingsplan importieren">
          <div className="card form">
            <p className="field__hint">
              CSV oder Excel mit den Spalten <strong>Datum, Trainingstyp, Dauer_min, Halle, Notiz</strong>.
              Datum als JJJJ-MM-TT, z. B. 2026-09-02.
            </p>
            {teams.length > 1 && (
              <Field label="Für Team">
                <ChoiceChips label="Ziel-Team" value={impTid} onChange={setImpTid}
                  options={teams.map(t => ({ value: t.id, label: t.name }))} />
              </Field>
            )}
            <div className="btn-row">
              <Button variant="ghost" icon={Download} onClick={downloadPlanTemplate}>Vorlage</Button>
              <label className="btn btn--secondary">
                <Upload size={18} aria-hidden="true" />Datei wählen
                <input type="file" accept=".csv,.xlsx,.xls" className="sr-only" onChange={e => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setImpMsg(null);
                  importTrainingPlan(f, data, update, impTid, n => setImpMsg(n > 0
                    ? { ok: true, text: `${n} Trainings geplant.` }
                    : { ok: false, text: "Keine gültigen Zeilen gefunden." }));
                }} />
              </label>
            </div>
            <Result msg={impMsg} />
          </div>
        </Section>

        <Section title="Datensicherung" hint={<Meta items={[`${teams.length} Teams`, `${(data.players ?? []).length} Spieler:innen`, `${data.sessions?.length ?? 0} Trainings`]} />}>
          <p className="field__hint">Alle Daten liegen nur auf diesem Gerät. Sichere sie regelmäßig.</p>
          <div className="list">
            <Row lead={<HardDriveDownload size={20} aria-hidden="true" />}
              title="Backup herunterladen" meta="Alle Daten als JSON-Datei"
              onClick={() => downloadBackup(data)} />
            <FileRow icon={HardDriveUpload} title="Backup wiederherstellen" meta="Ersetzt alle Daten auf diesem Gerät" accept=".json"
              onFile={f => readBackup(f,
                async imp => {
                  if (!(await confirm({ title: "Backup wiederherstellen?", confirmLabel: "Ersetzen", danger: true,
                    text: `Das Backup enthält ${imp.sessions.length} Trainings. Alle aktuellen Daten auf diesem Gerät werden ersetzt.` }))) return;
                  update(() => imp);
                  setBackupMsg({ ok: true, text: "Backup wiederhergestellt." });
                },
                err => setBackupMsg({ ok: false, text: "Import fehlgeschlagen: " + err }))} />
          </div>
          <Result msg={backupMsg} />
        </Section>

        <Section title="App">
          <div className="list">
            <div className="row">
              <span className="row__lead"><RefreshCw size={20} aria-hidden="true" /></span>
              <span className="row__main">
                <span className="row__title">Version</span>
                <span className="row__meta num">Stand {__BUILD_TIME__}</span>
              </span>
              {pwa?.needRefresh
                ? <Button variant="primary" size="sm" onClick={pwa.applyUpdate}>Installieren</Button>
                : <Button size="sm" onClick={pwa?.checkForUpdate} disabled={pwa?.checking} aria-label="Nach Updates suchen">
                    {pwa?.checking ? "Prüfe …" : "Prüfen"}
                  </Button>}
            </div>
            <div className="row">
              <span className="row__lead"><Smartphone size={20} aria-hidden="true" /></span>
              <span className="row__main">
                <span className="row__title">Als App installieren</span>
                <span className="row__meta">
                  iPhone/iPad (Safari): Teilen → „Zum Home-Bildschirm“. Android (Chrome): ⋮ → „App installieren“.
                  Installiert läuft TrainerHub auch offline in der Halle.
                </span>
              </span>
            </div>
          </div>
          {pwa?.upToDate && !pwa?.needRefresh && <Result msg={{ ok: true, text: "Du nutzt die neueste Version." }} />}
          <p className="field__hint">Ein Update tauscht nur den App-Code aus – Teams, Spieler:innen und Trainings bleiben erhalten.</p>
        </Section>

        <p className="footnote">TrainerHub · TV Bretten Basketball</p>
      </div>
    </div>
  );
}
