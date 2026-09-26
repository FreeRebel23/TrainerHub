// Ende-zu-Ende über den SyncController (so wie die App ihn nutzt) gegen eine echte PocketBase:
// Login, Erstübernahme alter Phase-2-Daten, zweites Gerät, zweiter Trainer, Offline-Phase,
// Konflikte, Löschungen, Rechte.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPocketBase, seedTenants, memoryStorage, switchableFetch, PASSWORD } from "./harness.js";
import { SyncController } from "../../src/sync/controller.js";
import { recordSession, removeSession, duplicateAsPlan, sessionDraftFromPlan } from "../../src/lib/training.js";
import { INIT } from "../../src/lib/constants.js";

let pb, t;
beforeAll(async () => { pb = await startPocketBase(); t = await seedTenants(pb); }, 60000);
afterAll(() => pb?.stop());

const clone = v => JSON.parse(JSON.stringify(v));
function device(storage = memoryStorage(), net = switchableFetch()) {
  const c = new SyncController({ serverUrl: pb.url, storage, fetchImpl: net.fetch, delayMs: 60000 });
  return { c, storage, net };
}

// Phase-2-Gerätestand: INIT-Stammdaten (IDs wie "t0", "p1", "tt1"), eine durchgeführte und eine
// offene Planung, ein Training aus Phase 1 (Verknüpfung nur über plan.recordedId), eine Saison.
function legacyData() {
  const d = clone(INIT);
  d.teams[0].name = "U16w";
  d.plannedSessions = [
    { id: "mz1abcd0001", teamId: "t0", trainingTypeId: "tt1", durationMinutes: 90, date: "2026-09-10", venueId: "v1", recordedId: "mz1sess0001" },
    { id: "mz1abcd0002", teamId: "t0", trainingTypeId: "tt3", durationMinutes: 90, date: "2026-10-08", venueId: "v3", recordedId: null,
      time: "18:30", focus: "Pressbreak", tags: ["Transition"], checklist: [{ id: "d1", text: "3-gegen-2", done: false, minutes: 20 }], note: "Hütchen" },
  ];
  d.sessions = [
    { id: "mz1sess0001", teamId: "t0", trainingTypeId: "tt1", date: "2026-09-10", durationMinutes: 90, factor: 1.5, venueId: "v1",
      attendance: [{ playerId: "p1", status: "present" }, { playerId: "p3", status: "injured_absent" }], note: "Phase 1", checklist: [], erfasstVon: "Florian" },
    { id: "mz1sess0002", teamId: "t0", trainingTypeId: "tt2", date: "2026-09-12", durationMinutes: 60, factor: 1, venueId: null,
      attendance: [{ playerId: "p2", status: "present" }], note: "", checklist: [{ id: "c1", text: "Sprints", done: true }], focus: "Athletik", tags: ["Athletik"] },
  ];
  d.seasons = [{ id: "mz1season01", teamId: "t0", name: "2026/27", startDate: "2026-08-01", endDate: "2027-06-30", phase: "vorbereitung",
    gamedays: [{ id: "g1", date: "2026-10-11", opponent: "KIT", isHome: true, result: "" }] }];
  d.settings = { trainerName: "Florian" };
  return d;
}

const byName = (list, name) => list.find(x => x.name === name);
let A, B, u16;   // Florian Gerät A (altes iPhone), Gerät B (zweites Gerät)

describe("Anmeldung und Erstübernahme", () => {
  it("ohne Anmeldung: Anmeldemaske; falsches Passwort wird abgelehnt", async () => {
    const d = device(memoryStorage({ trainerhub_v1: JSON.stringify(legacyData()) }));
    expect(d.c.mode).toBe("login");
    await expect(d.c.login("florian@test.local", "falsch")).rejects.toMatchObject({ status: 400 });
    expect(d.c.mode).toBe("login");
    A = d;
  });

  it("Gerät mit Phase-2-Daten: nach Login wird die Übernahme angeboten, Server ist leer", async () => {
    expect(await A.c.login("florian@test.local", PASSWORD)).toBe("migrate");
    const info = await A.c.inspectMigration();
    expect(info.serverEmpty).toBe(true);
    expect(info.local).toMatchObject({ teams: 1, players: 5, sessions: 2, plans: 2, seasons: 1 });
    expect(info.target).toBe("Verein A · Basketball");
  });

  it("Übernahme lädt alles hoch – Beziehungen bleiben erhalten, keine Beispiel-IDs auf dem Server", async () => {
    const st = await A.c.completeMigration("upload");
    expect(st.state).toBe("synced");
    expect(A.c.mode).toBe("ready");
    expect(A.c.pendingCount).toBe(0);
    const d = A.c.data;
    u16 = byName(d.teams, "U16w");
    expect(u16.id).toMatch(/^[a-z0-9]{10,}$/);
    expect(u16.playerIds).toHaveLength(5);
    const planDone = d.plannedSessions.find(p => p.id === "mz1abcd0001");
    expect(planDone.recordedId).toBe("mz1sess0001");                     // aus sessions.plan abgeleitet
    expect(d.sessions.find(s => s.id === "mz1sess0001").planId).toBe("mz1abcd0001");
    const s1 = d.sessions.find(s => s.id === "mz1sess0001");
    expect(s1.teamId).toBe(u16.id);
    expect(s1.attendance.map(a => a.playerId).every(id => d.players.some(p => p.id === id))).toBe(true);
    const open = d.plannedSessions.find(p => p.id === "mz1abcd0002");
    expect(open).toMatchObject({ time: "18:30", focus: "Pressbreak", tags: ["Transition"], note: "Hütchen", recordedId: null });
    expect(open.checklist[0]).toMatchObject({ text: "3-gegen-2", minutes: 20, done: false });
    expect(d.seasons[0].gamedays[0].opponent).toBe("KIT");
    expect(d.sessions.find(s => s.id === "mz1sess0001").erfasstVon).toBe("Florian");
    // Server-Sicht: Trainings gehören zum Team, Florian ist Trainer des neuen Teams
    const team = await pb.admin.call("GET", `/api/collections/teams/records/${u16.id}`);
    expect(team.trainers).toEqual([t.users.florian.id]);
    expect(team.section).toBe(t.basketball.id);
  });

  it("zweites Gerät ohne Daten: Login lädt denselben Stand, keine Übernahme-Frage", async () => {
    B = device();
    expect(await B.c.login("florian@test.local", PASSWORD)).toBe("ready");
    expect(B.c.data.sessions.map(s => s.id).sort()).toEqual(["mz1sess0001", "mz1sess0002"]);
    expect(byName(B.c.data.teams, "U16w").playerIds).toHaveLength(5);
    expect(B.c.data.plannedSessions.find(p => p.id === "mz1abcd0001").recordedId).toBe("mz1sess0001");
    expect(B.c.data.players.find(p => p.name === "Lena Berg").injured).toBe(true);
  });

  it("zweiter Durchlauf ohne Änderungen überträgt nichts (keine Scheinänderungen)", async () => {
    const before = await pb.admin.list("sessions");
    expect((await A.c.sync()).state).toBe("synced");
    expect((await B.c.sync()).state).toBe("synced");
    const after = await pb.admin.list("sessions");
    expect(after.map(s => s.updated)).toEqual(before.map(s => s.updated));
  });
});

describe("Planung und Training zwischen Geräten", () => {
  let planId;
  it("neue Planung auf Gerät A erscheint auf Gerät B", async () => {
    const plan = { ...duplicateAsPlan(A.c.data.plannedSessions.find(p => p.id === "mz1abcd0002"), { date: "2026-10-15" }), teamId: u16.id };
    planId = plan.id;
    A.c.update(d => ({ ...d, plannedSessions: [...d.plannedSessions, plan] }));
    expect(A.c.pendingCount).toBe(1);
    await A.c.sync();
    expect(A.c.pendingCount).toBe(0);
    await B.c.sync();
    const onB = B.c.data.plannedSessions.find(p => p.id === planId);
    expect(onB).toMatchObject({ date: "2026-10-15", focus: "Pressbreak", time: "18:30" });
  });

  it("Vorbereitung auf B (Übungen) → A", async () => {
    B.c.update(d => ({ ...d, plannedSessions: d.plannedSessions.map(p => p.id !== planId ? p : { ...p, checklist: [...p.checklist, { id: "x2", text: "Abschlussspiel", done: false }] }) }));
    await B.c.sync(); await A.c.sync();
    expect(A.c.data.plannedSessions.find(p => p.id === planId).checklist.map(d => d.text)).toEqual(["3-gegen-2", "Abschlussspiel"]);
  });

  it("offline in der Halle: Training durchführen und abschließen, danach synchronisieren", async () => {
    A.net.state.online = false;
    const plan = A.c.data.plannedSessions.find(p => p.id === planId);
    const draft = sessionDraftFromPlan(plan);
    const sess = { id: "offline0session1", ...draft, factor: 1.5, note: "Halle ohne Netz",
      attendance: [{ playerId: u16.playerIds[0], status: "present" }], checklist: draft.checklist.map((d, i) => ({ ...d, done: i === 0 })), erfasstVon: "Florian" };
    A.c.update(d => recordSession(d, sess));
    expect(A.c.data.plannedSessions.find(p => p.id === planId).recordedId).toBe("offline0session1");
    const st = await A.c.sync();
    expect(st.state).toBe("offline");
    expect(A.c.pendingCount).toBe(1);
    // App-Neustart offline: Daten und ausstehende Änderung sind noch da
    const restarted = new SyncController({ serverUrl: pb.url, storage: A.storage, fetchImpl: A.net.fetch, delayMs: 60000 });
    expect(restarted.mode).toBe("ready");
    expect(restarted.pendingCount).toBe(1);
    expect(restarted.data.sessions.some(s => s.id === "offline0session1")).toBe(true);
    A.c = restarted;
    A.net.state.online = true;
    expect((await A.c.sync()).state).toBe("synced");
    await B.c.sync();
    const onB = B.c.data.sessions.find(s => s.id === "offline0session1");
    expect(onB).toMatchObject({ note: "Halle ohne Netz", planId });
    expect(onB.checklist.map(d => d.done)).toEqual([true, false]);
    expect(B.c.data.plannedSessions.find(p => p.id === planId).recordedId).toBe("offline0session1");
  });

  it("Löschen eines Trainings: verschwindet überall und kommt nicht zurück; Planung wieder offen", async () => {
    A.c.update(d => removeSession(d, "offline0session1"));
    await A.c.sync();
    await B.c.sync();
    await A.c.sync();
    expect(A.c.data.sessions.some(s => s.id === "offline0session1")).toBe(false);
    expect(B.c.data.sessions.some(s => s.id === "offline0session1")).toBe(false);
    expect(B.c.data.plannedSessions.find(p => p.id === planId).recordedId).toBeNull();
    await expect(pb.admin.call("GET", "/api/collections/sessions/records/offline0session1")).rejects.toThrow(/404/);
  });

  it("offline gelöscht: kommt nach dem nächsten Server-Sync nicht wieder", async () => {
    A.net.state.online = false;
    A.c.update(d => ({ ...d, plannedSessions: d.plannedSessions.filter(p => p.id !== planId) }));
    await A.c.sync();
    expect(A.c.data.plannedSessions.some(p => p.id === planId)).toBe(false);
    A.net.state.online = true;
    await A.c.sync();
    await B.c.sync();
    expect(A.c.data.plannedSessions.some(p => p.id === planId)).toBe(false);
    expect(B.c.data.plannedSessions.some(p => p.id === planId)).toBe(false);
  });
});

describe("Konflikte", () => {
  const edit = (dev, fn) => dev.c.update(d => ({ ...d, sessions: d.sessions.map(s => s.id !== "mz1sess0002" ? s : fn(s)) }));

  it("verschiedene Felder derselben Einheit: beide Änderungen bleiben erhalten, kein Konflikt", async () => {
    A.net.state.online = false; B.net.state.online = false;
    edit(A, s => ({ ...s, note: "Notiz von A" }));
    edit(B, s => ({ ...s, focus: "Schwerpunkt von B" }));
    A.net.state.online = true; B.net.state.online = true;
    await A.c.sync(); await B.c.sync(); await A.c.sync();
    for (const dev of [A, B]) {
      expect(dev.c.data.sessions.find(s => s.id === "mz1sess0002")).toMatchObject({ note: "Notiz von A", focus: "Schwerpunkt von B" });
      expect(dev.c.meta.conflicts).toHaveLength(0);
    }
  });

  it("gleiches Feld: Serverstand gilt, lokale Fassung bleibt im Konfliktprotokoll und ist übernehmbar", async () => {
    A.net.state.online = false;
    edit(A, s => ({ ...s, note: "A offline" }));
    edit(B, s => ({ ...s, note: "B online" }));
    await B.c.sync();
    A.net.state.online = true;
    await A.c.sync();
    expect(A.c.data.sessions.find(s => s.id === "mz1sess0002").note).toBe("B online");
    const [conf] = A.c.meta.conflicts;
    expect(conf).toMatchObject({ coll: "sessions", id: "mz1sess0002", kind: "field", field: "note", local: "A offline", server: "B online" });
    A.c.resolveConflict(0, "mine");
    await A.c.sync(); await B.c.sync();
    expect(B.c.data.sessions.find(s => s.id === "mz1sess0002").note).toBe("A offline");
    expect(A.c.meta.conflicts).toHaveLength(0);
  });

  it("lokal gelöscht, anderswo inzwischen geändert: nicht gelöscht, Hinweis", async () => {
    A.net.state.online = false;
    A.c.update(d => removeSession(d, "mz1sess0002"));
    edit(B, s => ({ ...s, note: "noch wichtig" }));
    await B.c.sync();
    A.net.state.online = true;
    await A.c.sync();
    expect(A.c.data.sessions.find(s => s.id === "mz1sess0002").note).toBe("noch wichtig");
    expect(A.c.meta.conflicts.at(-1)).toMatchObject({ kind: "delete-rejected", id: "mz1sess0002" });
    A.c.resolveConflict(A.c.meta.conflicts.length - 1, "dismiss");
  });
});

describe("Rechte im Alltag", () => {
  it("zweiter Trainer mit Zugriff sieht das gemeinsame Team, ohne Zugriff nichts davon", async () => {
    const coach = device();
    await coach.c.login("coach@test.local", PASSWORD);
    expect(coach.c.data.teams).toEqual([]);
    await pb.admin.grant("coach@test.local", u16.id);
    await coach.c.sync();
    expect(coach.c.data.teams.map(x => x.name)).toEqual(["U16w"]);
    expect(coach.c.data.sessions.map(s => s.id).sort()).toEqual(["mz1sess0001", "mz1sess0002"]);
    const hand = device();
    await hand.c.login("hand@test.local", PASSWORD);
    expect(hand.c.data.teams.map(x => x.name)).toEqual(["Handball D"]);
    expect(hand.c.data.sessions).toEqual([]);
    expect(hand.c.data.players).toEqual([]);
    const other = device();
    await other.c.login("other@test.local", PASSWORD);
    expect(other.c.data.teams.map(x => x.name)).toEqual(["Fremdteam"]);
    expect(other.c.data.venues.every(v => v.organizationId === t.orgB.id)).toBe(true);
  });

  it("Zugriff entzogen: Teamdaten verschwinden beim nächsten Sync vom Gerät", async () => {
    const coach = device();
    await coach.c.login("coach@test.local", PASSWORD);
    expect(coach.c.data.sessions.length).toBe(2);
    await pb.admin.grant("coach@test.local", u16.id, false);
    await coach.c.sync();
    expect(coach.c.data.sessions).toEqual([]);
    expect(coach.c.data.teams).toEqual([]);
  });
});

describe("Sicherheit gegen Datenverlust", () => {
  it("Server nicht erreichbar beim Start: App nutzbar, Status offline, nichts geht verloren", async () => {
    const net = switchableFetch(); net.state.online = false;
    const c = new SyncController({ serverUrl: pb.url, storage: A.storage, fetchImpl: net.fetch, delayMs: 60000 });
    expect(c.mode).toBe("ready");
    expect(c.data.sessions.length).toBeGreaterThan(0);
    await c.resume();
    expect(c.status.state).toBe("offline");
    expect(c.data.sessions.length).toBeGreaterThan(0);
  });

  it("viele Löschungen auf einmal werden zurückgehalten und lassen sich wiederherstellen", async () => {
    const extra = Array.from({ length: 8 }, (_, i) => ({ id: `bulk0000000000${i}`, teamId: u16.id, date: "2026-11-0" + (i + 1), durationMinutes: 90, trainingTypeId: "", venueId: null, recordedId: null }));
    A.c.update(d => ({ ...d, plannedSessions: [...d.plannedSessions, ...extra] }));
    await A.c.sync();
    A.c.update(d => ({ ...d, plannedSessions: [] }));
    const st = await A.c.sync();
    expect(st.state).toBe("blocked");
    expect((await pb.admin.list("plans")).length).toBeGreaterThanOrEqual(9);
    A.c.restoreHeld();
    await A.c.sync();
    expect(A.c.status.state).toBe("synced");
    expect(A.c.data.plannedSessions.length).toBeGreaterThanOrEqual(9);
  });

  it("zweites altes Gerät desselben Trainers: Zusammenführen erzeugt keine Duplikate", async () => {
    const legacy = legacyData();
    legacy.sessions.push({ id: "mz1sess0099", teamId: "t0", trainingTypeId: "tt1", date: "2026-09-20", durationMinutes: 90, factor: 1.5, venueId: "v1", attendance: [{ playerId: "p1", status: "present" }], note: "nur auf Gerät C", checklist: [] });
    const C = device(memoryStorage({ trainerhub_v1: JSON.stringify(legacy) }));
    expect(await C.c.login("florian@test.local", PASSWORD)).toBe("migrate");
    const info = await C.c.inspectMigration();
    expect(info.serverEmpty).toBe(false);
    await expect(C.c.completeMigration("upload")).rejects.toThrow(/bereits Daten/);
    await C.c.completeMigration("merge");
    const teams = await pb.admin.list("teams", `section = "${t.basketball.id}"`);
    expect(teams.filter(x => x.name === "U16w")).toHaveLength(1);
    expect((await pb.admin.list("players", `section = "${t.basketball.id}"`)).filter(p => p.name === "Anna Müller")).toHaveLength(1);
    const sessions = await pb.admin.list("sessions");
    expect(sessions.filter(s => s.id === "mz1sess0001")).toHaveLength(1);
    expect(sessions.find(s => s.id === "mz1sess0099").team).toBe(u16.id);
    // Stand auf dem Server gewinnt; die abweichende alte Fassung liegt im Konfliktprotokoll
    expect(sessions.find(s => s.id === "mz1sess0002").note).toBe("noch wichtig");
  });

  it("Abmelden mit ausstehenden Änderungen fragt nach; danach sind keine Daten mehr auf dem Gerät", async () => {
    A.net.state.online = false;
    A.c.update(d => ({ ...d, sessions: d.sessions.map(s => ({ ...s, note: s.note + "!" })) }));
    expect(await A.c.logout()).toEqual({ pending: expect.any(Number) });
    expect(A.c.mode).toBe("ready");
    await A.c.logout({ force: true });
    expect(A.c.mode).toBe("login");
    expect(A.storage.getItem("trainerhub_v1")).toBeNull();
    expect(A.storage.getItem("trainerhub_sync")).toBeNull();
    A.net.state.online = true;
  });
});
