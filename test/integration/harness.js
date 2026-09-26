// Startet eine isolierte PocketBase-Instanz mit den Migrationen aus pocketbase/ (pro Testdatei
// ein eigenes Datenverzeichnis und ein eigener Port) und legt einen Mandanten-Testbestand an.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { ensurePocketBase } from "../../scripts/fetch-pocketbase.mjs";
import { adminApi } from "../../scripts/pb-admin.mjs";

const ROOT = join(import.meta.dirname, "../..");
export const SU = { email: "admin@test.local", password: "superuser-test-pass" };
export const PASSWORD = "trainer-pass-123";

function freePort() {
  return new Promise(res => { const s = createServer(); s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => res(p)); }); });
}

export async function startPocketBase() {
  const bin = await ensurePocketBase();
  const dir = mkdtempSync(join(tmpdir(), "th-pb-"));
  const args = ["--dir", join(dir, "pb_data"), "--migrationsDir", join(ROOT, "pocketbase/pb_migrations"), "--hooksDir", join(ROOT, "pocketbase/pb_hooks")];
  execFileSync(bin, ["migrate", "up", ...args], { stdio: "pipe" });
  execFileSync(bin, ["superuser", "upsert", SU.email, SU.password, ...args], { stdio: "pipe" });
  const port = await freePort();
  const proc = spawn(bin, ["serve", "--http", `127.0.0.1:${port}`, ...args], { stdio: "pipe" });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url + "/api/health")).ok) break; } catch { /* startet noch */ }
    await new Promise(r => setTimeout(r, 100));
  }
  const admin = await adminApi(url, SU.email, SU.password);
  // Rate-Limits (Schutz gegen Passwort-Raten) würden die vielen Test-Logins drosseln
  await admin.call("PATCH", "/api/settings", { rateLimits: { enabled: false } });
  return {
    url, admin, dir, bin, args,
    stop() { proc.kill(); rmSync(dir, { recursive: true, force: true }); },
    kill() { proc.kill(); },
  };
}

// Mandanten wie in der Praxis: Verein A (Basketball + Handball), Verein B
//   florian: Vereins-Admin A, Trainer U14w + U16w
//   coach:   Trainer U14w
//   hand:    Trainer Handball-Team (gleicher Verein, andere Abteilung)
//   other:   Trainer in Verein B
export async function seedTenants(pb) {
  const { admin } = pb;
  const a = await admin.bootstrap({ org: "Verein A", section: "Basketball" });
  const ah = await admin.bootstrap({ org: "Verein A", section: "Handball", seedDefaults: false });
  const b = await admin.bootstrap({ org: "Verein B", section: "Basketball" });
  const users = {};
  users.florian = (await admin.user({ email: "florian@test.local", name: "Florian", password: PASSWORD, org: "Verein A", orgAdmin: true })).user;
  users.coach = (await admin.user({ email: "coach@test.local", name: "Coach", password: PASSWORD, org: "Verein A" })).user;
  users.hand = (await admin.user({ email: "hand@test.local", name: "Hand", password: PASSWORD, org: "Verein A" })).user;
  users.other = (await admin.user({ email: "other@test.local", name: "Other", password: PASSWORD, org: "Verein B" })).user;
  const handTeam = await admin.create("teams", { section: ah.section.id, name: "Handball D", trainers: [users.hand.id] });
  const otherTeam = await admin.create("teams", { section: b.section.id, name: "Fremdteam", trainers: [users.other.id] });
  return { orgA: a.organization, basketball: a.section, handball: ah.section, orgB: b.organization, users, handTeam, otherTeam };
}

// localStorage-Ersatz für Node
export function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

// fetch, das sich per Schalter "offline" nehmen lässt
export function switchableFetch() {
  const state = { online: true };
  const f = (...a) => (state.online ? fetch(...a) : Promise.reject(new TypeError("Failed to fetch")));
  return { fetch: f, state };
}
