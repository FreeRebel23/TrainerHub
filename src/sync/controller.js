// Zentrale für Daten, Konto und Sync – unabhängig von React (testbar in Node gegen einen
// echten PocketBase-Server). Die Views sehen weiterhin nur `data` und `update(fn)`.
//
// Modi
//   local   – kein Server konfiguriert (GitHub-Pages-Build) oder bewusst „nur dieses Gerät“:
//             exakt das Verhalten aus Phase 1/2.
//   login   – Server konfiguriert, noch nicht angemeldet.
//   migrate – angemeldet, auf dem Gerät liegt ein bisher lokaler Datenstand → Übernahme klären.
//   ready   – angemeldet und gebunden: lokaler Stand ist Cache, Sync läuft im Hintergrund.

import { loadData, persist } from "../lib/data.js";
import { clearDraft } from "../lib/draft.js";
import { createClient, SyncError } from "./client.js";
import { toServerSets, fromServerSets, fieldsToLocal, localToFields, BY_NAME, PUSH_ORDER, COLLECTIONS } from "./mapping.js";
import { pendingChanges, rebase } from "./engine.js";
import { runSync, pullAll, rekeyId } from "./runner.js";
import { loadMeta, saveMeta, loadBase, saveBase, clearSync, emptyMeta } from "./store.js";
import { hasLocalContent, prepareUpload, summarize, EMPTY_DATA } from "./legacy.js";

const SYNC_DELAY_MS = 1500;

export class SyncController {
  constructor({ serverUrl = null, storage = globalThis.localStorage, fetchImpl, now = () => new Date().toISOString(), delayMs = SYNC_DELAY_MS } = {}) {
    this.serverUrl = serverUrl;
    this.storage = storage;
    this.now = now;
    this.delayMs = delayMs;
    this.client = serverUrl ? createClient(serverUrl, { fetchImpl }) : null;
    this.meta = loadMeta(storage);
    this.base = loadBase(storage);
    this.data = loadData(storage);
    if (this.client && this.meta.token) this.client.setToken(this.meta.token);
    this.status = { state: "idle", message: null };
    this.running = null;
    this.again = false;
    this.timer = null;
    this.listeners = new Set();
    this.version = 0;
    this.pendingCount = this.computePending();
  }

  // ─── Beobachten (React: useSyncExternalStore) ───
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.version++; this.listeners.forEach(fn => fn()); }
  getVersion() { return this.version; }

  get mode() {
    if (!this.client || this.meta.localOnly) return "local";
    if (!this.meta.user) return "login";
    if (!this.meta.bound) return "migrate";
    return "ready";
  }
  get ctx() { return { userId: this.meta.user?.id, organizationId: this.meta.organizationId, sectionId: this.meta.sectionId }; }

  computePending() {
    if (this.mode !== "ready") return 0;
    return pendingChanges(toServerSets(this.data, this.ctx), this.base).length;
  }

  saveAll() {
    const ok = persist(this.data, this.storage);
    saveMeta(this.meta, this.storage);
    saveBase(this.base, this.storage);
    if (!ok) this.status = { state: "error", message: "Gerätespeicher voll – Änderungen nicht gesichert." };
  }

  // ─── Daten (API wie bisher useData) ───
  update = (fn) => {
    this.data = fn(this.data);
    if (!persist(this.data, this.storage)) this.status = { state: "error", message: "Gerätespeicher voll – Änderungen nicht gesichert." };
    this.pendingCount = this.computePending();
    this.emit();
    this.schedule();
  };

  schedule(delay = this.delayMs) {
    if (this.mode !== "ready") return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.sync().catch(() => {}); }, delay);
  }

  // ─── Konto ───
  async login(email, password) {
    const r = await this.client.login(email.trim(), password);
    const user = { id: r.record.id, email: r.record.email, name: r.record.name ?? "" };
    if (this.meta.user && this.meta.user.id !== user.id) {
      this.client.setToken(this.meta.token);
      throw new SyncError("forbidden", "Auf diesem Gerät ist ein anderes Konto angemeldet. Bitte zuerst abmelden.");
    }
    const relogin = !!this.meta.user;
    if (!relogin) {
      try { await this.loadContext(); } catch (err) { this.client.setToken(null); throw err; }
    }
    this.meta = { ...this.meta, user, token: r.token, localOnly: false };
    if (!relogin) {
      // Bisher lokaler Datenstand → Übernahme klären; sonst leer starten und herunterladen
      if (hasLocalContent(this.data)) this.meta.bound = false;
      else { this.data = { ...EMPTY_DATA(), settings: this.data.settings ?? {} }; this.base = {}; this.meta.bound = true; }
    }
    if (!this.data.settings?.trainerName && user.name) this.data = { ...this.data, settings: { ...(this.data.settings ?? {}), trainerName: user.name } };
    this.status = { state: "idle", message: null };
    this.reloginOpen = false;
    this.saveAll();
    this.emit();
    if (this.mode === "ready") await this.sync().catch(() => {});
    return this.mode;
  }

  // Verein/Abteilung, in die neue Teams, Spieler:innen, Trainingsarten und Hallen gehören
  async loadContext() {
    const [orgs, sections] = await Promise.all([this.client.listAll("organizations"), this.client.listAll("sections")]);
    const teams = await this.client.listAll("teams");
    const me = this.client.userId;
    // Standard-Abteilung: wo ich Teams betreue, sonst wo ich Leitung bin, sonst die erste des Vereins
    const section = sections.find(s => teams.some(t => t.section === s.id && (t.trainers ?? []).includes(me)))
      ?? sections.find(s => (s.managers ?? []).includes(me))
      ?? sections[0] ?? null;
    this.meta.sectionId = section?.id ?? null;
    this.meta.organizationId = section?.organization ?? orgs[0]?.id ?? null;
    this.data = {
      ...this.data,
      organizations: orgs.map(o => ({ id: o.id, name: o.name })),
      sections: sections.map(s => ({ id: s.id, name: s.name, organizationId: s.organization, sport: s.sport })),
    };
    if (!this.meta.organizationId) throw new SyncError("forbidden", "Dein Konto ist noch keinem Verein zugeordnet.");
  }

  // Auf einem Gerät ohne Netz trotzdem mit den lokalen Daten weiterarbeiten (wie Phase 2)
  continueLocal() { this.meta = { ...this.meta, localOnly: true }; this.saveAll(); this.emit(); }
  // Aus dem lokalen Modus heraus später anmelden
  leaveLocal() { this.meta = { ...this.meta, localOnly: false }; this.saveAll(); this.emit(); }

  // Abgelaufene Anmeldung erneuern, ohne die App zu verlassen (Daten bleiben)
  openRelogin() { this.reloginOpen = true; this.emit(); }
  cancelRelogin() { this.reloginOpen = false; this.emit(); }

  // Abmelden entfernt die Daten des Kontos vom Gerät (geteilte Geräte). Ausstehende Änderungen
  // verhindern das ohne force. keepLocal: Übernahme abgebrochen – bisheriger Gerätestand bleibt.
  async logout({ force = false, keepLocal = false } = {}) {
    if (!force && this.pendingCount > 0) return { pending: this.pendingCount };
    clearTimeout(this.timer);
    if (!keepLocal) try { this.storage.removeItem("trainerhub_v1"); } catch { /* egal */ }
    clearSync(this.storage);
    clearDraft(this.storage);
    this.client?.setToken(null);
    this.meta = emptyMeta();
    this.base = {};
    this.data = keepLocal ? loadData(this.storage) : { ...EMPTY_DATA() };
    this.reloginOpen = false;
    this.pendingCount = 0;
    this.status = { state: "idle", message: null };
    this.emit();
    return { pending: 0 };
  }

  // ─── Erstübernahme ───
  // Liefert, was lokal liegt und was auf dem Server schon existiert (sichtbar für dieses Konto)
  async inspectMigration(source = this.data) {
    const pulled = await pullAll(this.client);
    const created = pulled.created;
    const sets = Object.fromEntries(PUSH_ORDER.map(n => [n, new Map([...pulled.remote[n]].map(([id, r]) => [id, r.f]))]));
    // Maßgeblich ist die Zielabteilung – ein Vereins-Admin sieht auch Teams anderer Abteilungen
    const server = inSection(fromServerSets(sets, created), this.meta.sectionId);
    const section = (this.data.sections ?? []).find(s => s.id === this.meta.sectionId);
    const org = (this.data.organizations ?? []).find(o => o.id === this.meta.organizationId);
    const merged = prepareUpload(source, { userId: this.meta.user.id, server });
    return {
      local: summarize(source), server: summarize(server),
      serverEmpty: !server.teams.length && !server.sessions.length && !server.plannedSessions.length,
      target: [org?.name, section?.name].filter(Boolean).join(" · "),
      matched: merged.matched,
      serverData: server,
    };
  }

  // mode: "upload" (Server leer → alles übernehmen), "merge" (nur Neues ergänzen, Stammdaten
  // gleichen Namens zusammenführen), "server" (lokale Daten verwerfen, Serverstand laden).
  // source: optional anderer Datenstand, z. B. eine Backup-Datei.
  async completeMigration(mode, { source = this.data, inspection = null } = {}) {
    const info = inspection ?? await this.inspectMigration(source);
    if (mode === "upload" && !info.serverEmpty) throw new Error("Auf dem Server liegen bereits Daten – bitte zusammenführen oder Serverdaten verwenden.");
    const keep = { settings: this.data.settings ?? {}, organizations: this.data.organizations, sections: this.data.sections };
    if (mode === "server") this.data = { ...EMPTY_DATA(), ...keep };
    else {
      // Stammdaten (Trainingsarten, Hallen, …) immer mit vorhandenen gleichnamigen zusammenführen –
      // auch bei „leerem“ Konto hat die Vereinseinrichtung meist schon Standard-Trainingsarten angelegt
      const prepared = prepareUpload(source, { userId: this.meta.user.id, server: info.serverData });
      this.data = { ...prepared.data, ...keep };
    }
    // Keine base: alles gilt als neu. Was es auf dem Server schon gibt, wird übernommen, nicht überschrieben.
    if (this.mode === "migrate") this.base = {};
    this.meta = { ...this.meta, bound: true, migratedAt: this.now() };
    this.saveAll();
    this.pendingCount = this.computePending();
    this.emit();
    return this.sync({ manual: true });
  }

  // Backup-Datei im Servermodus: nie ersetzen, sondern wie eine Erstübernahme zusammenführen
  async importBackup(imp) {
    const current = this.data;
    const info = await this.inspectMigration(imp);
    const prepared = prepareUpload(imp, { userId: this.meta.user.id, server: info.serverData });
    // Bereits vorhanden – auch unter einer beim Sync vergebenen Ersatz-ID (siehe runner.js)
    const add = (list) => {
      const coll = COLLECTIONS.find(c => c.local === list).name;
      const have = new Set((current[list] ?? []).map(x => x.id));
      return [...(current[list] ?? []), ...(prepared.data[list] ?? [])
        .filter(x => !have.has(x.id) && !have.has(rekeyId(this.meta.user.id, coll, x.id)))];
    };
    this.update(d => ({ ...d, ...Object.fromEntries(["players", "teams", "trainingTypes", "venues", "seasons", "plannedSessions", "sessions"].map(l => [l, add(l)])) }));
    return summarize(prepared.data);
  }

  // ─── Sync ───
  async sync({ allowMassDelete = false } = {}) {
    if (this.mode !== "ready") return null;
    if (this.running) { this.again = true; return this.running; }
    this.status = { state: "syncing", message: null };
    this.emit();
    this.running = this.syncOnce(allowMassDelete).finally(() => {
      this.running = null;
      if (this.again) { this.again = false; this.schedule(0); }
    });
    return this.running;
  }

  async syncOnce(allowMassDelete) {
    let out;
    try {
      out = await runSync({ client: this.client, data: this.data, base: this.base, ctx: this.ctx, allowMassDelete, now: this.now() });
    } catch (err) {
      this.status = statusFromError(err);
      this.pendingCount = this.computePending();
      this.emit();
      return this.status;
    }
    // Während des Syncs lokal Geändertes gewinnt (wird beim nächsten Durchlauf übertragen)
    const merged = rebase(toServerSets(this.data, this.ctx), out.snapshot, out.result);
    const local = fromServerSets(merged, out.created);
    this.data = { ...this.data, ...local, organizations: out.organizations, sections: out.sections };
    this.base = out.nextBase;
    this.meta = {
      ...this.meta,
      lastSync: out.interrupted ? this.meta.lastSync : this.now(),
      conflicts: [...(this.meta.conflicts ?? []), ...out.conflicts],
      errors: out.errors,
      held: out.held.length,
    };
    this.saveAll();
    this.pendingCount = this.computePending();
    this.status = out.interrupted ? statusFromError(out.interrupted)
      : out.held.length ? { state: "blocked", message: `${out.held.length} Löschungen warten auf Bestätigung.` }
      : out.errors.length ? { state: "error", message: `${out.errors.length} Einträge konnten nicht übertragen werden.` }
      : { state: this.pendingCount ? "pending" : "synced", message: null };
    this.emit();
    if (this.again) this.schedule(0);
    return this.status;
  }

  // Anmeldung beim Start auffrischen (verlängert die Sitzung); offline ohne Folgen
  async resume() {
    if (this.mode !== "ready") return;
    try {
      const r = await this.client.refresh();
      this.meta = { ...this.meta, token: r.token, user: { ...this.meta.user, name: r.record?.name ?? this.meta.user.name } };
      saveMeta(this.meta, this.storage);
    } catch (err) {
      if (err instanceof SyncError && err.kind === "auth") { this.status = statusFromError(err); this.emit(); return; }
    }
    await this.sync().catch(() => {});
  }

  // ─── Konflikte und Sicherheitsbremse ───
  resolveConflict(index, choice) {
    const c = (this.meta.conflicts ?? [])[index];
    if (!c) return;
    this.meta = { ...this.meta, conflicts: this.meta.conflicts.filter((_, i) => i !== index) };
    saveMeta(this.meta, this.storage);
    const list = BY_NAME[c.coll]?.local;
    if (choice === "mine" && list && c.kind === "field") {
      // Nur das kollidierte Feld zurücksetzen – andere, zusammengeführte Änderungen bleiben
      this.update(d => ({ ...d, [list]: (d[list] ?? []).map(x => {
        if (x.id !== c.id) return x;
        const f = { ...localToFields(c.coll, x, this.ctx), [c.field]: c.local };
        return fieldsToLocal(c.coll, c.id, f);
      }) }));
    } else if (choice === "mine" && list && c.local && c.kind !== "delete-rejected") {
      const mine = fieldsToLocal(c.coll, c.id, c.local);
      this.update(d => ({ ...d, [list]: [...(d[list] ?? []).filter(x => x.id !== c.id), mine] }));
    } else this.emit();
  }

  confirmMassDelete() { return this.sync({ allowMassDelete: true }); }

  // Zurückgehaltene Löschungen verwerfen: Einträge aus dem letzten gemeinsamen Stand zurückholen
  restoreHeld() {
    const local = toServerSets(this.data, this.ctx);
    const restore = {};
    PUSH_ORDER.forEach(n => {
      Object.entries(this.base[n] ?? {}).forEach(([id, b]) => {
        if (!local[n].has(id)) (restore[BY_NAME[n].local] ??= []).push(fieldsToLocal(n, id, b.f));
      });
    });
    this.update(d => ({ ...d, ...Object.fromEntries(Object.entries(restore).map(([l, xs]) => [l, [...(d[l] ?? []), ...xs]])) }));
  }
}

// Anzeige-Sicht: Trainingsarten anderer Abteilungen ausblenden (z. B. für Vereins-Admins), sofern
// sie nicht verwendet werden. Nur lesend – Änderungen laufen über update() auf dem vollen Stand.
export function viewData(data, sectionId) {
  if (!sectionId || !(data.trainingTypes ?? []).some(t => t.sectionId && t.sectionId !== sectionId)) return data;
  const used = new Set([...(data.sessions ?? []), ...(data.plannedSessions ?? [])].map(x => x.trainingTypeId));
  return { ...data, trainingTypes: data.trainingTypes.filter(t => !t.sectionId || t.sectionId === sectionId || used.has(t.id)) };
}

// Nur die Daten einer Abteilung (Teams, deren Spieler:innen, Trainings, Planungen, Saisons)
export function inSection(data, sectionId) {
  const teams = (data.teams ?? []).filter(t => t.sectionId === sectionId);
  const ids = new Set(teams.map(t => t.id));
  return {
    ...data, teams,
    players: (data.players ?? []).filter(p => p.sectionId === sectionId),
    trainingTypes: (data.trainingTypes ?? []).filter(x => x.sectionId === sectionId),
    sessions: (data.sessions ?? []).filter(x => ids.has(x.teamId)),
    plannedSessions: (data.plannedSessions ?? []).filter(x => ids.has(x.teamId)),
    seasons: (data.seasons ?? []).filter(x => ids.has(x.teamId)),
  };
}

export function statusFromError(err) {
  const kind = err?.kind;
  if (kind === "offline") return { state: "offline", message: "Offline – Änderungen werden später übertragen." };
  if (kind === "auth") return { state: "auth", message: "Anmeldung abgelaufen – bitte erneut anmelden." };
  if (kind === "ratelimit" || kind === "server") return { state: "offline", message: "Server gerade nicht verfügbar – neuer Versuch folgt." };
  return { state: "error", message: err?.message ?? "Sync fehlgeschlagen." };
}
