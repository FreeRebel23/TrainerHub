// Serverseitige Rechte: Was ein angemeldeter Trainer über die API sehen und ändern darf.
// Ein versteckter Button ist keine Berechtigung – geprüft wird direkt gegen die REST-API.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPocketBase, seedTenants, PASSWORD } from "./harness.js";
import { createClient } from "../../src/sync/client.js";

let pb, t, c = {}, team = {};

beforeAll(async () => {
  pb = await startPocketBase();
  t = await seedTenants(pb);
  for (const n of ["florian", "coach", "hand", "other"]) {
    c[n] = createClient(pb.url);
    await c[n].login(`${n}@test.local`, PASSWORD);
  }
  team.u14 = await pb.admin.create("teams", { section: t.basketball.id, name: "U14w", trainers: [t.users.florian.id, t.users.coach.id] });
  team.u16 = await pb.admin.create("teams", { section: t.basketball.id, name: "U16w", trainers: [t.users.florian.id] });
  await pb.admin.create("sessions", { id: "u16session000001", team: team.u16.id, date: "2026-10-01", note: "nur U16" });
  await pb.admin.create("plans", { id: "u14plan000000001", team: team.u14.id, date: "2026-10-02", focus: "gemeinsam" });
  await pb.admin.create("players", { id: "handplayer000001", section: t.handball.id, name: "Handballerin" });
  await pb.admin.create("players", { id: "bbplayer00000001", section: t.basketball.id, name: "Basketballerin" });
  await pb.admin.create("sessions", { id: "fremd00000000001", team: t.otherTeam.id, date: "2026-10-01", note: "Verein B" });
}, 60000);
afterAll(() => pb?.stop());

const names = xs => xs.map(x => x.name ?? x.id).sort();

describe("Mandantentrennung und Team-Rechte", () => {
  it("Trainer sieht nur eigene Teams; zweiter Trainer desselben Teams sieht es auch", async () => {
    expect(names(await c.coach.listAll("teams"))).toEqual(["U14w"]);
    // Vereins-Admin sieht alle Teams seines Vereins (auch Handball), aber keine fremden Vereine
    expect(names(await c.florian.listAll("teams"))).toEqual(["Handball D", "U14w", "U16w"]);
    expect(names(await c.other.listAll("teams"))).toEqual(["Fremdteam"]);
  });

  it("gemeinsame Planung ist für beide Trainer sichtbar, fremde Trainings nicht", async () => {
    expect((await c.coach.listAll("plans")).map(p => p.id)).toEqual(["u14plan000000001"]);
    expect((await c.coach.listAll("sessions")).map(s => s.id)).toEqual([]);
    await expect(c.coach.get("sessions", "u16session000001")).rejects.toMatchObject({ kind: "notfound" });
    await expect(c.other.get("plans", "u14plan000000001")).rejects.toMatchObject({ kind: "notfound" });
  });

  it("unberechtigtes Anlegen, Ändern, Verschieben und Löschen wird abgelehnt", async () => {
    await expect(c.coach.create("sessions", { team: team.u16.id, date: "2026-10-03" })).rejects.toMatchObject({ status: 400 });
    await expect(c.coach.update("sessions", "u16session000001", { note: "x" })).rejects.toMatchObject({ kind: "notfound" });
    await expect(c.coach.remove("sessions", "u16session000001")).rejects.toMatchObject({ kind: "notfound" });
    await expect(c.coach.update("plans", "u14plan000000001", { team: team.u16.id })).rejects.toMatchObject({ kind: "notfound" });
    await expect(c.other.update("plans", "u14plan000000001", { focus: "x" })).rejects.toMatchObject({ kind: "notfound" });
    // Florian betreut beide Teams und darf verschieben
    const moved = await c.florian.update("plans", "u14plan000000001", { team: team.u16.id });
    expect(moved.team).toBe(team.u16.id);
    await c.florian.update("plans", "u14plan000000001", { team: team.u14.id });
  });

  it("Filter-Tricks umgehen die Regeln nicht", async () => {
    const r = await fetch(`${pb.url}/api/collections/sessions/records?filter=${encodeURIComponent("note != ''")}`, { headers: { Authorization: c.other.token } });
    expect((await r.json()).items.map(s => s.id)).toEqual(["fremd00000000001"]);
  });

  it("Spieler:innen sind abteilungsweit sichtbar, nicht abteilungs- oder vereinsübergreifend", async () => {
    expect(names(await c.coach.listAll("players"))).toEqual(["Basketballerin"]);
    expect(names(await c.hand.listAll("players"))).toEqual(["Handballerin"]);
    expect(names(await c.other.listAll("players"))).toEqual([]);
    await expect(c.coach.create("players", { section: t.handball.id, name: "X" })).rejects.toMatchObject({ status: 400 });
  });

  it("Trainer:innen-Zuordnung ändern nur Admins; neue Teams nur mit sich selbst", async () => {
    await expect(c.coach.update("teams", team.u14.id, { trainers: [t.users.coach.id, t.users.hand.id] })).rejects.toMatchObject({ kind: "notfound" });
    await expect(c.coach.create("teams", { section: t.basketball.id, name: "U12", trainers: [t.users.coach.id, t.users.hand.id] })).rejects.toMatchObject({ status: 400 });
    const own = await c.coach.create("teams", { section: t.basketball.id, name: "U12", trainers: [t.users.coach.id] });
    expect(own.trainers).toEqual([t.users.coach.id]);
    await expect(c.coach.create("teams", { section: t.handball.id, name: "fremd", trainers: [t.users.coach.id] })).rejects.toMatchObject({ status: 400 });
  });

  it("Stammdaten: Hallen vereinsweit, Trainingsarten je Abteilung; Löschen nur Admins", async () => {
    expect((await c.coach.listAll("venues")).length).toBeGreaterThan(0);
    expect(await c.other.listAll("venues")).toHaveLength(4);   // nur die eigenen aus Verein B
    const types = await c.coach.listAll("training_types");
    expect(types.every(x => x.section === t.basketball.id)).toBe(true);
    await expect(c.coach.remove("training_types", types[0].id)).rejects.toMatchObject({ kind: "notfound" });
  });

  it("Vereine/Abteilungen sind lesbar für Mitglieder, änderbar nur als Superuser", async () => {
    expect(names(await c.coach.listAll("organizations"))).toEqual(["Verein A"]);
    await expect(c.florian.update("organizations", t.orgA.id, { name: "x" })).rejects.toMatchObject({ status: 403 });
    await expect(c.coach.create("organizations", { name: "neu" })).rejects.toMatchObject({ status: 403 });
  });

  it("keine Selbstregistrierung, Konten sehen nur sich selbst", async () => {
    const r = await fetch(`${pb.url}/api/collections/users/records`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "neu@test.local", password: "12345678901", passwordConfirm: "12345678901" }) });
    expect(r.status).toBe(403);
    expect((await c.coach.listAll("users")).map(u => u.email)).toEqual(["coach@test.local"]);
  });

  it("ohne Anmeldung gibt es keine Daten – in keiner Collection", async () => {
    const anon = createClient(pb.url);
    for (const coll of ["organizations", "sections", "teams", "players", "venues", "training_types", "seasons", "plans", "sessions", "users"]) {
      expect(await anon.listAll(coll), coll).toEqual([]);
    }
    await expect(anon.create("sessions", { team: team.u14.id, date: "2026-10-01" })).rejects.toMatchObject({ status: 400 });
    await expect(anon.update("plans", "u14plan000000001", { focus: "x" })).rejects.toMatchObject({ kind: "notfound" });
  });
});
