// Phase 4 serverseitig: Saisonkader, Beobachtungen, Spieler-Sichtbarkeit, Löschverhalten.
// Geprüft direkt gegen die REST-API (eine ausgeblendete Schaltfläche ist keine Berechtigung).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPocketBase, seedTenants, PASSWORD } from "./harness.js";
import { createClient } from "../../src/sync/client.js";

let pb, t, c = {}, team = {}, season = {}, pl = {};
const names = xs => xs.map(x => x.name).sort();

beforeAll(async () => {
  pb = await startPocketBase();
  t = await seedTenants(pb);
  const A = pb.admin;
  // co: zweite Trainerin von U16w, sonst nichts; mgr: section_manager Basketball + coach U14w
  t.users.co = (await A.user({ email: "co@test.local", name: "Co", password: PASSWORD, org: "Verein A" })).user;
  t.users.mgr = (await A.user({ email: "mgr@test.local", name: "Mgr", password: PASSWORD, org: "Verein A", sectionManager: t.basketball.id })).user;
  for (const n of ["florian", "coach", "co", "mgr", "hand", "other"]) { c[n] = createClient(pb.url); await c[n].login(`${n}@test.local`, PASSWORD); }
  for (const [k, name] of [["ina", "Ina"], ["mia", "Mia"], ["lea", "Lea"], ["alt", "Nur Teamliste"], ["frei", "Ohne Team"]])
    pl[k] = await A.create("players", { section: t.basketball.id, name });
  team.u16 = await A.create("teams", { section: t.basketball.id, name: "U16w", trainers: [t.users.coach.id, t.users.co.id] });
  team.u14 = await A.create("teams", { section: t.basketball.id, name: "U14w", trainers: [t.users.florian.id, t.users.mgr.id], players: [pl.alt.id] });
  season.u16 = await A.create("seasons", { team: team.u16.id, name: "2026/27", startDate: "2026-08-01", endDate: "2027-06-30", phase: "saison" });
  season.u16old = await A.create("seasons", { team: team.u16.id, name: "2025/26", startDate: "2025-08-01", endDate: "2026-06-30", phase: "abgeschlossen" });
  season.u14 = await A.create("seasons", { team: team.u14.id, name: "2026/27", startDate: "2026-08-01", endDate: "2027-06-30", phase: "saison" });
  for (const k of ["ina", "mia"]) await A.create("roster_entries", { season: season.u16.id, team: team.u16.id, player: pl[k].id, status: "active" });
  await A.create("roster_entries", { season: season.u16old.id, team: team.u16.id, player: pl.lea.id, status: "active" });
}, 60000);
afterAll(() => pb?.stop());

describe("Spieler-Sichtbarkeit nach Teams", () => {
  it("coach sieht nur Personen seiner Teams (auch aus früheren Saisons), Leitung/Admin die Abteilung", async () => {
    expect(names(await c.coach.listAll("players"))).toEqual(["Ina", "Lea", "Mia"]);
    expect(names(await c.co.listAll("players"))).toEqual(["Ina", "Lea", "Mia"]);
    expect(names(await c.florian.listAll("players"))).toEqual(["Ina", "Lea", "Mia", "Nur Teamliste", "Ohne Team"]);   // organisation_admin
    expect(names(await c.mgr.listAll("players"))).toEqual(["Ina", "Lea", "Mia", "Nur Teamliste", "Ohne Team"]);       // section_manager
    expect(await c.hand.listAll("players")).toEqual([]);
    expect(await c.other.listAll("players")).toEqual([]);
    await expect(c.coach.get("players", pl.alt.id)).rejects.toMatchObject({ kind: "notfound" });
    await expect(c.coach.update("players", pl.frei.id, { name: "x" })).rejects.toMatchObject({ kind: "notfound" });
  });

  it("neue Person im eigenen Kader: anlegen, zuordnen, danach sichtbar", async () => {
    const p = await c.coach.create("players", { id: "neuespielerin001", section: t.basketball.id, name: "Neu" });
    expect(p.id).toBe("neuespielerin001");
    await c.coach.create("roster_entries", { season: season.u16.id, team: team.u16.id, player: p.id, status: "active" });
    expect(names(await c.coach.listAll("players"))).toContain("Neu");
    expect(names(await c.florian.listAll("players"))).toContain("Neu");
  });
});

describe("Saisonkader", () => {
  it("coach pflegt den Kader seines Teams, nicht fremde; keine Kreuz-Zuordnungen", async () => {
    await expect(c.coach.create("roster_entries", { season: season.u14.id, team: team.u14.id, player: pl.ina.id, status: "active" })).rejects.toMatchObject({ status: 400 });
    await expect(c.coach.create("roster_entries", { season: season.u14.id, team: team.u16.id, player: pl.lea.id, status: "active" })).rejects.toMatchObject({ status: 400 });  // Saison eines anderen Teams
    const hp = await pb.admin.create("players", { section: t.handball.id, name: "Handballerin X" });
    await expect(c.coach.create("roster_entries", { season: season.u16.id, team: team.u16.id, player: hp.id, status: "active" })).rejects.toMatchObject({ status: 400 });  // andere Abteilung
    const [entry] = (await c.coach.listAll("roster_entries")).filter(e => e.player === pl.mia.id);
    const upd = await c.coach.update("roster_entries", entry.id, { jerseyNumber: "7", position: "Aufbau", status: "paused" });
    expect(upd).toMatchObject({ jerseyNumber: "7", status: "paused" });
    await expect(c.coach.update("roster_entries", entry.id, { team: team.u14.id })).rejects.toMatchObject({ kind: "notfound" });
    expect((await c.other.listAll("roster_entries"))).toEqual([]);
  });

  it("gleiche Person in zwei Saisons und im Folgejahr in einem anderen Team", async () => {
    await pb.admin.create("roster_entries", { season: season.u14.id, team: team.u14.id, player: pl.lea.id, status: "active" });
    const lea = (await c.florian.listAll("roster_entries")).filter(e => e.player === pl.lea.id).map(e => e.season).sort();
    expect(lea).toEqual([season.u14.id, season.u16old.id].sort());
    // coach von U16w sieht nur den U16-Eintrag (Historie), nicht die U14-Zugehörigkeit
    expect((await c.coach.listAll("roster_entries")).filter(e => e.player === pl.lea.id).map(e => e.season)).toEqual([season.u16old.id]);
  });
});

describe("Beobachtungen", () => {
  let session, obs;
  it("anlegen nur im eigenen Team und nur im eigenen Namen", async () => {
    session = await c.coach.create("sessions", { team: team.u16.id, date: "2026-09-24", note: "Pressbreak" });
    obs = await c.coach.create("observations", { team: team.u16.id, player: pl.ina.id, date: "2026-09-24", session: session.id,
      text: "Öffnet sich nach Ballaufnahme zu spät.", tags: ["Pressbreak"], createdBy: t.users.coach.id, capturedAt: "2026-09-24T18:40:00Z" });
    expect(obs).toMatchObject({ player: pl.ina.id, session: session.id, createdBy: t.users.coach.id });
    await expect(c.coach.create("observations", { team: team.u16.id, player: pl.ina.id, date: "2026-09-24", text: "x", createdBy: t.users.co.id })).rejects.toMatchObject({ status: 400 });
    await expect(c.coach.create("observations", { team: team.u14.id, player: pl.alt.id, date: "2026-09-24", text: "x", createdBy: t.users.coach.id })).rejects.toMatchObject({ status: 400 });
    await expect(c.other.create("observations", { team: team.u16.id, player: pl.ina.id, date: "2026-09-24", text: "x", createdBy: t.users.other.id })).rejects.toMatchObject({ status: 400 });
  });

  it("zweite Trainerin sieht sie; ändern/löschen nur Ersteller:in oder Leitung", async () => {
    expect((await c.co.listAll("observations")).map(o => o.text)).toEqual(["Öffnet sich nach Ballaufnahme zu spät."]);
    await expect(c.co.update("observations", obs.id, { text: "geändert" })).rejects.toMatchObject({ kind: "notfound" });
    await expect(c.co.remove("observations", obs.id)).rejects.toMatchObject({ kind: "notfound" });
    await expect(c.coach.update("observations", obs.id, { player: pl.mia.id })).rejects.toMatchObject({ kind: "notfound" });
    await expect(c.coach.update("observations", obs.id, { createdBy: t.users.co.id })).rejects.toMatchObject({ kind: "notfound" });
    expect(await c.coach.update("observations", obs.id, { text: "Öffnet sich nach Ballaufnahme unter Druck zu spät." })).toMatchObject({ createdBy: t.users.coach.id });
    expect((await c.mgr.listAll("observations")).length).toBe(1);                 // section_manager
    expect(await c.other.listAll("observations")).toEqual([]);                    // anderer Verein
    expect(await c.hand.listAll("observations")).toEqual([]);                     // andere Abteilung
    const anon = await fetch(`${pb.url}/api/collections/observations/records`);
    expect((await anon.json()).items).toEqual([]);
  });

  it("Training löschen: Beobachtung bleibt, nur der Verweis entfällt", async () => {
    await c.coach.remove("sessions", session.id);
    const kept = await c.coach.get("observations", obs.id);
    expect(kept).toMatchObject({ session: "", player: pl.ina.id, text: expect.stringContaining("unter Druck") });
  });

  it("aus dem Kader entfernen löscht nichts; Saison mit Kader ist nicht löschbar", async () => {
    await expect(pb.admin.call("DELETE", `/api/collections/seasons/records/${season.u16.id}`)).rejects.toThrow(/400/);
    expect((await c.coach.listAll("observations")).length).toBe(1);
  });

  it("Person endgültig löschen (nur Leitung/Admin) entfernt bewusst auch ihre Kader- und Beobachtungsdaten", async () => {
    await expect(c.coach.remove("players", pl.ina.id)).rejects.toMatchObject({ kind: "notfound" });
    await c.florian.remove("players", pl.ina.id);
    expect(await c.coach.listAll("observations")).toEqual([]);
    expect((await c.coach.listAll("roster_entries")).some(e => e.player === pl.ina.id)).toBe(false);
  });
});
