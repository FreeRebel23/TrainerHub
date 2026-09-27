// Migration 1760000400 (Phase 4) auf einem bestehenden Phase-3-Datenstand: vorwärts und zurück.
// Bestehende Teams, Teamlisten, Saisons, Planungen, Trainings und Anwesenheiten bleiben unverändert;
// nur die aktive Saison erhält einmalig den bisherigen Teamkader als Saisonkader.
import { describe, it, expect, afterAll } from "vitest";
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, copyFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { ensurePocketBase } from "../../scripts/fetch-pocketbase.mjs";
import { adminApi } from "../../scripts/pb-admin.mjs";
import { SU } from "./harness.js";

const ROOT = join(import.meta.dirname, "../..");
const PHASE4 = "1760000400_team_workspace.js";
const dir = mkdtempSync(join(tmpdir(), "th-mig-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const freePort = () => new Promise(res => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
async function serve(bin, args) {
  const port = await freePort();
  const proc = spawn(bin, ["serve", "--http", `127.0.0.1:${port}`, ...args], { stdio: "pipe" });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url + "/api/health")).ok) break; } catch { /* startet */ } await new Promise(r => setTimeout(r, 100)); }
  return { proc, admin: await adminApi(url, SU.email, SU.password) };
}
const stop = proc => new Promise(r => { proc.once("exit", r); proc.kill(); });
// Bestehende Phase-2/3-Daten (ohne Änderungszeitstempel und das neue, leere Feld goals)
const snapshot = async admin => Object.fromEntries(await Promise.all(["players", "teams", "seasons", "plans", "sessions"].map(async n =>
  [n, (await admin.list(n)).map(({ updated: _u, goals: _g, ...r }) => r).sort((a, b) => a.id.localeCompare(b.id))])));

describe("Migration Phase 3 → Phase 4", () => {
  it("vorwärts: aktive Saison erhält Teamkader, alles andere bleibt; rückwärts: Ausgangsstand", async () => {
    const bin = await ensurePocketBase();
    const oldMigrations = join(dir, "migrations-phase3");
    mkdirSync(oldMigrations);
    for (const f of readdirSync(join(ROOT, "pocketbase/pb_migrations"))) if (f !== PHASE4) copyFileSync(join(ROOT, "pocketbase/pb_migrations", f), join(oldMigrations, f));
    const data = join(dir, "pb_data");
    const hooks = ["--hooksDir", join(ROOT, "pocketbase/pb_hooks")];
    const oldArgs = ["--dir", data, "--migrationsDir", oldMigrations, ...hooks];
    const newArgs = ["--dir", data, "--migrationsDir", join(ROOT, "pocketbase/pb_migrations"), ...hooks];
    execFileSync(bin, ["migrate", "up", ...oldArgs], { stdio: "pipe" });
    execFileSync(bin, ["superuser", "upsert", SU.email, SU.password, ...oldArgs], { stdio: "pipe" });

    // Phase-3-Bestand
    let s = await serve(bin, oldArgs);
    const A = s.admin;
    const { section } = await A.bootstrap({ org: "Verein", section: "Basketball" });
    const p = [];
    for (const n of ["Anna", "Berta", "Carla"]) p.push(await A.create("players", { section: section.id, name: n }));
    const team = await A.create("teams", { section: section.id, name: "U16w", trainers: [], players: p.map(x => x.id) });
    const bare = await A.create("teams", { section: section.id, name: "Ohne Saison", trainers: [], players: [p[0].id] });
    const now = new Date().toISOString().slice(0, 10);
    const y = Number(now.slice(0, 4));
    const old = await A.create("seasons", { team: team.id, name: "alt", startDate: `${y - 2}-08-01`, endDate: `${y - 1}-06-30`, phase: "abgeschlossen" });
    const cur = await A.create("seasons", { team: team.id, name: "aktuell", startDate: `${y - 1}-07-01`, endDate: `${y + 1}-06-30`, phase: "saison",
      gamedays: [{ id: "g1", date: now, opponent: "Gegner", isHome: true, result: "" }] });
    const plan = await A.create("plans", { team: team.id, date: now, focus: "Pressbreak", tags: ["Pressbreak"] });
    const sess = await A.create("sessions", { team: team.id, plan: plan.id, date: now, note: "Alt", attendance: p.map(x => ({ playerId: x.id, status: "present" })) });
    const before = await snapshot(A);
    await stop(s.proc);

    // vorwärts
    execFileSync(bin, ["migrate", "up", ...newArgs], { stdio: "pipe" });
    s = await serve(bin, newArgs);
    const roster = await s.admin.list("roster_entries");
    expect(roster.map(r => [r.season, r.team, r.status]).every(([se, te, st]) => se === cur.id && te === team.id && st === "active")).toBe(true);
    expect(roster.map(r => r.player).sort()).toEqual(p.map(x => x.id).sort());
    expect(roster.some(r => r.season === old.id)).toBe(false);          // Historie nicht erfunden
    expect(roster.some(r => r.team === bare.id)).toBe(false);           // Team ohne Saison: Teamliste bleibt Kader
    expect(await snapshot(s.admin)).toEqual(before);                                          // bestehende Daten unverändert
    expect((await s.admin.call("GET", `/api/collections/sessions/records/${sess.id}`)).attendance).toHaveLength(3);
    await stop(s.proc);

    // zweimal vorwärts ist nicht möglich (PocketBase merkt sich angewandte Migrationen) → zurück
    execFileSync(bin, ["migrate", "down", "1", ...newArgs], { input: "y\n", stdio: ["pipe", "pipe", "pipe"] });
    s = await serve(bin, oldArgs);
    expect(await s.admin.call("GET", "/api/collections/roster_entries/records").catch(e => e.message)).toMatch(/404/);
    expect(await snapshot(s.admin)).toEqual(before);
    await stop(s.proc);
  }, 60000);
});
