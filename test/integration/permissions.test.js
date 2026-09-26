// Berechtigungsprofile organisation_admin · section_manager · coach (Migration 1760000200).
// Geprüft wird direkt gegen die REST-API mit echten Konten – nicht gegen die App-Oberfläche.
//
// Bestand (Verein A: Basketball + Handball, Verein B: Basketball):
//   orgadmin   organisation_admin Verein A, sonst nichts
//   mgr        section_manager Basketball (A)
//   coach      coach U14w (A/Basketball)
//   multi      section_manager Handball (A) + coach U16w (A/Basketball) + coach U12w (A/Basketball)
//   plain      nur Vereinsmitglied A, kein Profil
//   adminb     organisation_admin Verein B
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPocketBase, seedTenants, PASSWORD } from "./harness.js";
import { createClient } from "../../src/sync/client.js";
import { permissionSummary, canCreateTeams } from "../../src/sync/permissions.js";

let pb, t, c = {}, tm = {}, u = {};
const names = xs => xs.map(x => x.name ?? x.id).sort();
const ids = xs => xs.map(x => x.id).sort();

beforeAll(async () => {
  pb = await startPocketBase();
  t = await seedTenants(pb);
  const A = { org: "Verein A" }, B = { org: "Verein B" };
  for (const [n, o] of [["orgadmin", A], ["mgr", A], ["multi", A], ["plain", A], ["adminb", B]]) {
    u[n] = (await pb.admin.user({ email: `${n}@test.local`, name: n, password: PASSWORD, ...o })).user;
  }
  u.coach = t.users.coach;
  await pb.admin.permit({ email: "orgadmin@test.local", profile: "organisation_admin", scope: "Verein A", org: "Verein A" });
  await pb.admin.permit({ email: "mgr@test.local", profile: "section_manager", scope: "Basketball", org: "Verein A", title: "Sportliche Leitung" });
  await pb.admin.permit({ email: "multi@test.local", profile: "section_manager", scope: "Handball", org: "Verein A" });
  await pb.admin.permit({ email: "adminb@test.local", profile: "organisation_admin", scope: "Verein B", org: "Verein B" });
  tm.u14 = await pb.admin.createTeam({ section: "Basketball", name: "U14w", org: "Verein A", coach: "coach@test.local" });
  tm.u16 = await pb.admin.createTeam({ section: "Basketball", name: "U16w", org: "Verein A", coach: "multi@test.local" });
  tm.u12 = await pb.admin.createTeam({ section: "Basketball", name: "U12w", org: "Verein A", coach: "multi@test.local" });
  tm.hand = t.handTeam; tm.b = t.otherTeam;
  await pb.admin.create("sessions", { id: "sessu16000000001", team: tm.u16.id, date: "2026-10-01" });
  await pb.admin.create("sessions", { id: "sesshand00000001", team: tm.hand.id, date: "2026-10-01" });
  await pb.admin.create("sessions", { id: "sessb00000000001", team: tm.b.id, date: "2026-10-01" });
  for (const n of ["orgadmin", "mgr", "coach", "multi", "plain", "adminb"]) {
    c[n] = createClient(pb.url);
    await c[n].login(`${n}@test.local`, PASSWORD);
  }
}, 90000);
afterAll(() => pb?.stop());

describe("organisation_admin", () => {
  it("sieht den gesamten eigenen Verein, keinen fremden", async () => {
    expect(names(await c.orgadmin.listAll("sections"))).toEqual(["Basketball", "Handball"]);
    expect(names(await c.orgadmin.listAll("teams"))).toEqual(["Handball D", "U12w", "U14w", "U16w"]);
    expect(ids(await c.orgadmin.listAll("sessions"))).toEqual(["sessu16000000001", "sesshand00000001"].sort());
    expect(names(await c.orgadmin.listAll("organizations"))).toEqual(["Verein A"]);
  });

  it("verwaltet Abteilungen, Teams, Zuordnungen und den Verein – nur im eigenen Verein", async () => {
    const vb = await c.orgadmin.create("sections", { organization: t.orgA.id, name: "Volleyball", sport: "Volleyball" });
    await c.orgadmin.update("sections", vb.id, { managers: [u.plain.id] });
    const team = await c.orgadmin.create("teams", { section: vb.id, name: "Damen 1", trainers: [u.coach.id] });
    expect(team.trainers).toEqual([u.coach.id]);
    await c.orgadmin.update("organizations", t.orgA.id, { functions: { [u.orgadmin.id]: "Vereinsvorstand" } });
    await expect(c.orgadmin.create("sections", { organization: t.orgB.id, name: "X" })).rejects.toMatchObject({ status: 400 });
    await expect(c.orgadmin.update("organizations", t.orgB.id, { name: "x" })).rejects.toMatchObject({ kind: "notfound" });
    await expect(c.orgadmin.create("teams", { section: t.orgB.id, name: "X" })).rejects.toBeTruthy();
    // aufräumen, damit spätere Erwartungen stabil bleiben
    await c.orgadmin.remove("teams", team.id);
    await c.orgadmin.remove("sections", vb.id);
  });

  it("ist keine Serveradministration: keine Superuser-Collection, keine Konten anlegen", async () => {
    await expect(c.orgadmin.listAll("_superusers")).rejects.toMatchObject({ status: 403 });
    await expect(c.orgadmin.create("users", { email: "x@test.local", password: "1234567890a", passwordConfirm: "1234567890a" })).rejects.toMatchObject({ status: 403 });
  });
});

describe("section_manager", () => {
  it("sieht die eigene Abteilung vollständig, keine andere", async () => {
    expect(names(await c.mgr.listAll("sections"))).toEqual(["Basketball"]);
    expect(names(await c.mgr.listAll("teams"))).toEqual(["U12w", "U14w", "U16w"]);
    expect(ids(await c.mgr.listAll("sessions"))).toEqual(["sessu16000000001"]);   // ohne coach von U16w zu sein
    expect(await c.mgr.listAll("players")).toEqual(expect.any(Array));
    await expect(c.mgr.get("sessions", "sesshand00000001")).rejects.toMatchObject({ kind: "notfound" });
  });

  it("legt in der eigenen Abteilung Teams an und ordnet coaches zu", async () => {
    const team = await c.mgr.create("teams", { section: t.basketball.id, name: "U10", trainers: [u.coach.id, u.plain.id] });
    expect(team.trainers.sort()).toEqual([u.coach.id, u.plain.id].sort());
    await c.mgr.update("teams", tm.u14.id, { "trainers+": u.plain.id, functions: { [u.plain.id]: "Co-Trainer" } });
    expect(names(await c.plain.listAll("teams"))).toEqual(["U10", "U14w"]);
    await c.mgr.update("teams", tm.u14.id, { "trainers-": u.plain.id });
    await c.mgr.remove("teams", team.id);
    expect(names(await c.plain.listAll("teams"))).toEqual([]);
  });

  it("kein Team und keine Zuordnung in einer fremden Abteilung oder mit fremdem Konto", async () => {
    await expect(c.mgr.create("teams", { section: t.handball.id, name: "X" })).rejects.toMatchObject({ status: 400 });
    await expect(c.mgr.update("teams", tm.hand.id, { trainers: [u.mgr.id] })).rejects.toMatchObject({ kind: "notfound" });
    // Konto aus Verein B kann nicht coach in Verein A werden (Hook: nur Vereinsmitglieder)
    await expect(c.mgr.update("teams", tm.u14.id, { "trainers+": t.users.other.id })).rejects.toMatchObject({ status: 400 });
    // Abteilungen und Leitungen verwaltet der organisation_admin
    await expect(c.mgr.update("sections", t.basketball.id, { managers: [u.mgr.id, u.plain.id] })).rejects.toBeTruthy();
    await expect(c.mgr.create("sections", { organization: t.orgA.id, name: "Tennis" })).rejects.toMatchObject({ status: 400 });
  });

  it("verwaltet Stammdaten der Abteilung (Trainingsarten löschen)", async () => {
    const tt = await c.mgr.create("training_types", { section: t.basketball.id, name: "Probe", duration: 30 });
    await c.mgr.remove("training_types", tt.id);
  });
});

describe("coach", () => {
  it("sieht nur zugeordnete Teams und deren Abteilung", async () => {
    expect(names(await c.coach.listAll("teams"))).toEqual(["U14w"]);
    expect(names(await c.coach.listAll("sections"))).toEqual(["Basketball"]);
    await expect(c.coach.get("teams", tm.u16.id)).rejects.toMatchObject({ kind: "notfound" });
    await expect(c.coach.get("sessions", "sessu16000000001")).rejects.toMatchObject({ kind: "notfound" });
  });

  it("bearbeitet Teamdaten, aber keine Zuordnungen, Funktionen oder neue Teams", async () => {
    const plan = await c.coach.create("plans", { team: tm.u14.id, date: "2026-10-05", focus: "Defense" });
    await c.coach.update("plans", plan.id, { focus: "Pressbreak" });
    await c.coach.update("teams", tm.u14.id, { name: "U14w" });
    await expect(c.coach.update("teams", tm.u14.id, { functions: { [u.coach.id]: "Cheftrainer" } })).rejects.toMatchObject({ kind: "notfound" });
    await expect(c.coach.create("teams", { section: t.basketball.id, name: "X", trainers: [u.coach.id] })).rejects.toMatchObject({ status: 400 });
    await c.coach.remove("plans", plan.id);
  });
});

describe("mehrere Berechtigungen gleichzeitig", () => {
  it("section_manager Handball + coach U16w/U12w: Rechte addieren sich je Scope", async () => {
    expect(names(await c.multi.listAll("teams"))).toEqual(["Handball D", "U12w", "U16w"]);
    expect(names(await c.multi.listAll("sections"))).toEqual(["Basketball", "Handball"]);
    expect(ids(await c.multi.listAll("sessions"))).toEqual(["sessu16000000001", "sesshand00000001"].sort());
    // Team anlegen: in Handball (Leitung) ja, in Basketball (nur coach) nein
    const h2 = await c.multi.create("teams", { section: t.handball.id, name: "Handball E" });
    await c.multi.remove("teams", h2.id);
    await expect(c.multi.create("teams", { section: t.basketball.id, name: "X" })).rejects.toMatchObject({ status: 400 });
    await expect(c.multi.update("teams", tm.u16.id, { "trainers+": u.plain.id })).rejects.toMatchObject({ kind: "notfound" });
  });

  it("die Client-Ableitung sieht dieselben Profile", async () => {
    const [organizations, sections, teams] = await Promise.all(["organizations", "sections", "teams"].map(x => c.multi.listAll(x)));
    const p = permissionSummary(u.multi.id, { organizations, sections, teams });
    expect(p.organisationAdmin).toEqual([]);
    expect(p.sectionManager).toEqual([t.handball.id]);
    expect(p.coach.sort()).toEqual([tm.u12.id, tm.u16.id].sort());
    expect(canCreateTeams(p, { organizationId: t.orgA.id, sectionId: t.handball.id })).toBe(true);
    expect(canCreateTeams(p, { organizationId: t.orgA.id, sectionId: t.basketball.id })).toBe(false);
  });
});

describe("Zugehörigkeit, Funktionen, Mandantentrennung", () => {
  it("Vereinsmitglied ohne Profil sieht nur den Vereinsdatensatz", async () => {
    expect(names(await c.plain.listAll("organizations"))).toEqual(["Verein A"]);
    for (const coll of ["sections", "teams", "players", "venues", "training_types", "seasons", "plans", "sessions"]) {
      expect(await c.plain.listAll(coll), coll).toEqual([]);
    }
  });

  it("Funktionsbezeichnungen sind keine Berechtigungsquelle", async () => {
    await pb.admin.setFunction({ email: "plain@test.local", scopeType: "section", scope: "Basketball", org: "Verein A", title: "Abteilungsleiter" });
    expect(await c.plain.listAll("teams")).toEqual([]);
    const s = (await c.mgr.listAll("sections"))[0];
    expect(s.functions).toMatchObject({ [u.mgr.id]: "Sportliche Leitung", [u.plain.id]: "Abteilungsleiter" });
  });

  it("kein Konto aus Verein A erhält über irgendeine Abfrage Daten aus Verein B – und umgekehrt", async () => {
    const colls = ["organizations", "sections", "teams", "players", "venues", "training_types", "seasons", "plans", "sessions", "users"];
    const bIds = new Set([t.orgB.id, t.users.other.id, u.adminb.id]);
    for (const coll of ["sections", "teams", "players", "venues", "training_types", "sessions"])
      (await pb.admin.list(coll)).filter(r => [r.organization, r.section, r.team].some(x => bIds.has(x)) || r.id === tm.b.id || r.id === "sessb00000000001").forEach(r => bIds.add(r.id));
    for (const n of ["orgadmin", "mgr", "coach", "multi", "plain"]) {
      for (const coll of colls) {
        const leak = (await c[n].listAll(coll)).filter(r => bIds.has(r.id));
        expect(leak, `${n}/${coll}`).toEqual([]);
      }
    }
    const aIds = new Set([t.orgA.id, t.basketball.id, t.handball.id, tm.u14.id, tm.u16.id, "sessu16000000001"]);
    for (const coll of colls) expect((await c.adminb.listAll(coll)).filter(r => aIds.has(r.id)), `adminb/${coll}`).toEqual([]);
  });
});
