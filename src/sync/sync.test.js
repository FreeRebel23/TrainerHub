import { describe, it, expect } from "vitest";
import { localToFields, fieldsToLocal, toServerSets, fromServerSets, same } from "./mapping.js";
import { reconcile, pendingChanges, rebase, orderOps, sanitizeRelations } from "./engine.js";
import { migrateIds, linkPlans, isPristineInit, hasLocalContent, matchToServer, stableId, VALID_ID } from "./legacy.js";
import { loadMeta, saveMeta } from "./store.js";
import { SyncController } from "./controller.js";
import { INIT } from "../lib/constants.js";

const clone = v => JSON.parse(JSON.stringify(v));
const sets = (coll, entries) => {
  const s = toServerSets({});
  s[coll] = new Map(entries);
  return s;
};
const remote = (coll, entries) => {
  const s = Object.fromEntries(Object.keys(toServerSets({})).map(n => [n, new Map()]));
  s[coll] = new Map(entries.map(([id, f, u]) => [id, { f, u }]));
  return s;
};

describe("Abbildung lokal ↔ Server", () => {
  const session = { id: "s1", teamId: "t", date: "2026-10-01", durationMinutes: 90, factor: 1.5, attendance: [{ playerId: "p", status: "present" }],
    note: "", checklist: [{ id: "d", text: "X", done: true }], venueId: null, trainingTypeId: "tt", planId: "p1", erfasstVon: "Florian", time: "18:30", custom: 42 };

  it("Rundreise ohne Verlust; unbekannte Felder landen in extra", () => {
    const f = localToFields("sessions", session);
    expect(f).toMatchObject({ team: "t", plan: "p1", recordedBy: "Florian", venue: "", note: "", extra: { custom: 42 } });
    const back = fieldsToLocal("sessions", "s1", f);
    const { note: _empty, ...rest } = session;   // leere Notiz wird lokal weggelassen (content() liefert "")
    expect(back).toEqual(rest);
    expect(same(localToFields("sessions", back), f)).toBe(true);
  });

  it("Phase-2-Planung ohne neue Felder und mit fehlenden Werten ist kanonisch stabil", () => {
    const plan = { id: "p", teamId: "t", trainingTypeId: "tt", durationMinutes: 90, date: "2026-10-01", venueId: "v", recordedId: "s9" };
    const f = localToFields("plans", plan);
    expect(f).toMatchObject({ time: "", focus: "", tags: null, checklist: null, note: "", extra: null });
    expect(f).not.toHaveProperty("recordedId");
    expect(same(localToFields("plans", fieldsToLocal("plans", "p", f)), f)).toBe(true);
  });

  it("Spieler:innen: Jahrgang null ↔ 0, Abteilung aus dem Kontext", () => {
    const f = localToFields("players", { id: "p", name: "Anna", birthYear: null, injured: false }, { sectionId: "sec" });
    expect(f).toMatchObject({ birthYear: 0, section: "sec", injured: false });
    expect(fieldsToLocal("players", "p", f)).toEqual({ id: "p", name: "Anna", birthYear: null, injured: false, sectionId: "sec" });
  });

  it("recordedId wird aus sessions.plan abgeleitet (ältestes Training gewinnt)", () => {
    const s = toServerSets({ plannedSessions: [{ id: "p1", teamId: "t", date: "d" }, { id: "p2", teamId: "t", date: "d" }],
      sessions: [{ id: "b", teamId: "t", date: "d", planId: "p1" }, { id: "a", teamId: "t", date: "d", planId: "p1" }] });
    const d = fromServerSets(s, { a: "2026-01-02", b: "2026-01-01" });
    expect(d.plannedSessions.map(p => p.recordedId)).toEqual(["b", null]);
  });
});

describe("Abgleich (Dreiwege)", () => {
  const f = (note, extra = {}) => ({ ...localToFields("sessions", { teamId: "t", date: "2026-10-01", note }), ...extra });

  it("neu lokal → anlegen; neu auf dem Server → übernehmen", () => {
    const r = reconcile(sets("sessions", [["a", f("x")]]), {}, remote("sessions", [["b", f("y"), "u1"]]));
    expect(r.ops).toEqual([{ type: "create", coll: "sessions", id: "a", fields: f("x") }]);
    expect(r.result.sessions.get("b").note).toBe("y");
    expect(r.nextBase.sessions.b).toEqual({ f: f("y"), u: "u1" });
  });

  it("nur lokal geändert → nur geänderte Felder übertragen", () => {
    const base = { sessions: { a: { f: f("alt"), u: "u1" } } };
    const r = reconcile(sets("sessions", [["a", f("neu")]]), base, remote("sessions", [["a", f("alt"), "u1"]]));
    expect(r.ops).toEqual([{ type: "update", coll: "sessions", id: "a", fields: { note: "neu" } }]);
  });

  it("beide geändert, verschiedene Felder → zusammengeführt ohne Konflikt", () => {
    const base = { sessions: { a: { f: f("alt"), u: "u1" } } };
    const l = { ...f("lokal") };
    const srv = { ...f("alt"), focus: "vom Server" };
    const r = reconcile(sets("sessions", [["a", l]]), base, remote("sessions", [["a", srv, "u2"]]));
    expect(r.conflicts).toEqual([]);
    expect(r.result.sessions.get("a")).toMatchObject({ note: "lokal", focus: "vom Server" });
    expect(r.ops[0].fields).toEqual({ note: "lokal" });
  });

  it("gleiches Feld → Server gewinnt, lokaler Wert im Protokoll", () => {
    const base = { sessions: { a: { f: f("alt"), u: "u1" } } };
    const r = reconcile(sets("sessions", [["a", f("lokal")]]), base, remote("sessions", [["a", f("server"), "u2"]]), { now: "T" });
    expect(r.result.sessions.get("a").note).toBe("server");
    expect(r.ops).toEqual([]);
    expect(r.conflicts[0]).toMatchObject({ kind: "field", field: "note", local: "lokal", server: "server", at: "T" });
  });

  it("Löschen: lokal gelöscht → löschen; Server geändert → nicht löschen; Server gelöscht → lokal weg", () => {
    const base = { sessions: { a: { f: f("x"), u: "u1" }, b: { f: f("x"), u: "u1" }, c: { f: f("x"), u: "u1" } } };
    const local = sets("sessions", [["c", f("lokal geändert")]]);
    const r = reconcile(local, base, remote("sessions", [["a", f("x"), "u1"], ["b", f("x"), "u2"]]));
    expect(r.ops).toEqual([{ type: "delete", coll: "sessions", id: "a" }]);
    expect(r.result.sessions.has("b")).toBe(true);
    expect(r.result.sessions.has("c")).toBe(false);
    expect(r.conflicts.map(c => c.kind).sort()).toEqual(["delete-rejected", "deleted-remote"]);
  });

  it("existiert auf dem Server ohne gemeinsame Basis → nie überschreiben", () => {
    const r = reconcile(sets("sessions", [["a", f("lokal")]]), {}, remote("sessions", [["a", f("server"), "u1"]]));
    expect(r.ops).toEqual([]);
    expect(r.result.sessions.get("a").note).toBe("server");
    expect(r.conflicts[0].kind).toBe("exists");
  });

  it("Sicherheitsbremse bei vielen Löschungen", () => {
    const base = { sessions: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`s${i}`, { f: f("x"), u: "u" }])) };
    const rem = remote("sessions", Array.from({ length: 10 }, (_, i) => [`s${i}`, f("x"), "u"]));
    const r = reconcile(sets("sessions", []), base, rem);
    expect(r.held).toHaveLength(10);
    expect(r.ops).toEqual([]);
    expect(reconcile(sets("sessions", []), base, rem, { allowMassDelete: true }).ops).toHaveLength(10);
  });

  it("ausstehende Änderungen ohne Netz zählen", () => {
    const base = { sessions: { a: { f: f("x"), u: "u" }, gone: { f: f("x"), u: "u" } } };
    const p = pendingChanges(sets("sessions", [["a", f("y")], ["n", f("z")]]), base);
    expect(p.map(x => x.type).sort()).toEqual(["create", "delete", "update"]);
  });

  it("Reihenfolge: Stammdaten vor Trainings, Löschen umgekehrt", () => {
    const ops = [{ type: "create", coll: "sessions" }, { type: "delete", coll: "plans" }, { type: "delete", coll: "sessions" }, { type: "create", coll: "teams" }];
    expect(orderOps(ops).map(o => `${o.type}:${o.coll}`)).toEqual(["create:teams", "create:sessions", "delete:sessions", "delete:plans"]);
  });

  it("Verweise ins Leere werden geleert statt den Sync zu blockieren", () => {
    const local = toServerSets({ sessions: [{ id: "s", teamId: "t", date: "d", planId: "weg" }], teams: [{ id: "t", name: "T", playerIds: ["p", "fehlt"] }], players: [{ id: "p", name: "P" }] });
    sanitizeRelations(local, {});
    expect(local.sessions.get("s").plan).toBe("");
    expect(local.teams.get("t").players).toEqual(["p"]);
  });

  it("während des Syncs lokal Geändertes gewinnt gegenüber dem Ergebnis", () => {
    const snap = sets("sessions", [["a", f("1")], ["b", f("1")]]);
    const cur = sets("sessions", [["a", f("lokal neu")], ["c", f("neu")]]);   // b lokal gelöscht
    const synced = sets("sessions", [["a", f("server")], ["b", f("server")], ["d", f("vom Server")]]);
    const r = rebase(cur, snap, synced);
    expect([...r.sessions.keys()].sort()).toEqual(["a", "c", "d"]);
    expect(r.sessions.get("a").note).toBe("lokal neu");
  });
});

describe("Übernahme alter Gerätestände", () => {
  const legacy = () => {
    const d = clone(INIT);
    d.plannedSessions = [{ id: "plan0000001", teamId: "t0", trainingTypeId: "tt1", venueId: "v1", date: "2026-10-01", recordedId: "sess0000001" }];
    d.sessions = [{ id: "sess0000001", teamId: "t0", trainingTypeId: "tt1", venueId: "v1", date: "2026-10-01", attendance: [{ playerId: "p1", status: "present" }] }];
    return d;
  };

  it("kurze IDs werden deterministisch ersetzt – mit allen Verweisen", () => {
    const { data, changed } = migrateIds(legacy(), "user1");
    expect(changed).toBe(5 + 1 + 4 + 4);
    const all = ["players", "teams", "trainingTypes", "venues", "plannedSessions", "sessions"].flatMap(l => data[l].map(x => x.id));
    expect(all.every(id => VALID_ID.test(id))).toBe(true);
    const team = data.teams[0];
    expect(team.playerIds).toEqual(data.players.map(p => p.id));
    expect(data.sessions[0]).toMatchObject({ teamId: team.id, trainingTypeId: data.trainingTypes[0].id, venueId: data.venues[0].id });
    expect(data.sessions[0].attendance[0].playerId).toBe(data.players[0].id);
    expect(data.plannedSessions[0].recordedId).toBe("sess0000001");   // gültige IDs bleiben
    expect(migrateIds(legacy(), "user1").data).toEqual(data);        // deterministisch
    expect(migrateIds(legacy(), "user2").data.teams[0].id).not.toBe(team.id);
    expect(stableId("a")).toMatch(VALID_ID);
  });

  it("Phase-1-Verknüpfung (nur recordedId) wird am Training ergänzt", () => {
    expect(linkPlans(legacy()).sessions[0].planId).toBe("plan0000001");
  });

  it("unberührte Beispieldaten gelten nicht als eigener Datenstand", () => {
    expect(isPristineInit(clone(INIT))).toBe(true);
    expect(hasLocalContent(clone(INIT))).toBe(false);
    expect(hasLocalContent(legacy())).toBe(true);
    const renamed = clone(INIT); renamed.teams[0].name = "U18m";
    expect(hasLocalContent(renamed)).toBe(true);
  });

  it("Zusammenführen erkennt gleichnamige Stammdaten und stellt Verweise um", () => {
    const d = migrateIds(legacy(), "u").data;
    const server = { teams: [{ id: "srvteam00001", name: "u16w " }], players: [{ id: "srvanna00001", name: "Anna Müller", birthYear: 2009 }],
      trainingTypes: [{ id: "srvtype00001", name: "Basketball" }], venues: [] };
    const { data, matched } = matchToServer(d, server);
    expect(matched).toMatchObject({ teams: 1, players: 1, trainingTypes: 1, venues: 0 });
    expect(data.sessions[0]).toMatchObject({ teamId: "srvteam00001", trainingTypeId: "srvtype00001" });
    expect(data.sessions[0].attendance[0].playerId).toBe("srvanna00001");
    expect(data.teams[0].playerIds[0]).toBe("srvanna00001");
  });
});

describe("Lokaler Modus und Speicher", () => {
  const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; };

  it("ohne Server verhält sich TrainerHub wie in Phase 2", () => {
    const st = mem();
    const c = new SyncController({ serverUrl: null, storage: st });
    expect(c.mode).toBe("local");
    c.update(d => ({ ...d, sessions: [{ id: "x", teamId: "t0", date: "2026-10-01" }] }));
    expect(JSON.parse(st.getItem("trainerhub_v1")).sessions).toHaveLength(1);
    expect(c.pendingCount).toBe(0);
  });

  it("defekter Sync-Speicher führt zu leerem Zustand statt Absturz", () => {
    const st = mem(); st.setItem("trainerhub_sync", "{kaputt");
    expect(loadMeta(st).user).toBeNull();
    expect(saveMeta({ conflicts: Array.from({ length: 80 }, (_, i) => i) }, st)).toBe(true);
    expect(loadMeta(st).conflicts).toHaveLength(50);
  });
});

describe("Anzeige-Sicht", () => {
  it("blendet ungenutzte Trainingsarten anderer Abteilungen aus, ohne Daten zu verändern", async () => {
    const { viewData } = await import("./controller.js");
    const data = { trainingTypes: [{ id: "a", sectionId: "bb" }, { id: "b", sectionId: "hb" }, { id: "c", sectionId: "hb" }, { id: "d" }],
      sessions: [{ id: "s", trainingTypeId: "c" }], plannedSessions: [] };
    expect(viewData(data, "bb").trainingTypes.map(t => t.id)).toEqual(["a", "c", "d"]);
    expect(data.trainingTypes).toHaveLength(4);
    expect(viewData(data, null)).toBe(data);
  });
});
