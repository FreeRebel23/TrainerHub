// Browser-Ende-zu-Ende Phase 4 (Team Workspace & Beobachtungen) gegen einen laufenden TrainerHub-Stack
// (deploy/compose.yaml, lokal oder Staging-ähnlich). Legt seine Testdaten selbst über die Admin-API an.
//
//   E2E_URL=http://127.0.0.1:18190 PB_URL=http://127.0.0.1:18191 \
//   PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… E2E_PASSWORD=… \
//   PLAYWRIGHT_MODULE=/pfad/zu/playwright node e2e/phase4.e2e.mjs
//
// Ablauf (Auftrag Phase 4, Punkt 39):
//  Trainer A: Login → U16w öffnen → Saison 2026/27 → Kader → Training planen → starten →
//             Beobachtung während des Trainings → abschließen
//  Trainer B: Login (zweiter Browserkontext) → U16w → dieselbe Spielerin → Beobachtung sehen
//  A offline: weitere Beobachtung → App-Neustart ohne Netz → lokal vorhanden → online → Sync → B sieht sie
//  C (Trainer eines anderen Teams): kann nichts davon lesen – auch nicht direkt über die API

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { adminApi } from "../scripts/pb-admin.mjs";

const require = createRequire(import.meta.url);
const { chromium } = await import("playwright").catch(() => require(process.env.PLAYWRIGHT_MODULE ?? "playwright"));

const URL = process.env.E2E_URL ?? "http://127.0.0.1:18190";
const DOMAIN = process.env.E2E_DOMAIN ?? "p4.localtest.dev";
const OUT = process.env.E2E_OUT ?? "e2e-output/phase4";
const PW = process.env.E2E_PASSWORD;
const THURSDAY = "2026-10-01";
const AFTERNOON = new Date("2026-10-01T16:00:00+02:00");
const EVENING = new Date("2026-10-01T18:40:00+02:00");
const PLAYERS = ["Ina Keller", "Mia Brandt", "Lea Vogt", "Zoe Hartmann", "Emma Roth"];

mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, info = "") { results.push({ name, ok: !!ok, info }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? " – " + info : ""}`); }

// ─── Testdaten (nur über die API, keine echten Personen) ───
const admin = await adminApi(process.env.PB_URL, process.env.PB_SUPERUSER_EMAIL, process.env.PB_SUPERUSER_PASSWORD);
const { section } = await admin.bootstrap({ org: "TV Phase4", section: "Basketball" });
const user = async (n, name) => (await admin.user({ email: `${n}@${DOMAIN}`, name, password: PW, org: "TV Phase4" })).user;
const U = { a: await user("trainer-a", "Trainer A"), b: await user("trainer-b", "Trainer B"), c: await user("trainer-c", "Trainer C") };
const team = async (name, trainers) => (await admin.find("teams", `section = "${section.id}" && name = "${name}"`))
  ?? await admin.create("teams", { section: section.id, name, trainers });
const T = { u16: await team("U16w", [U.a.id, U.b.id]), u14: await team("U14w", [U.a.id]), u14m: await team("U14m", [U.c.id]) };
const season = async t => (await admin.find("seasons", `team = "${t.id}" && name = "Saison 2026/27"`))
  ?? await admin.create("seasons", { team: t.id, name: "Saison 2026/27", startDate: "2026-08-01", endDate: "2027-06-30", phase: "saison" });
const S16 = await season(T.u16);
await season(T.u14);
for (const name of PLAYERS) {
  const p = await admin.find("players", `section = "${section.id}" && name = "${name}"`) ?? await admin.create("players", { section: section.id, name });
  if (!await admin.find("roster_entries", `season = "${S16.id}" && player = "${p.id}"`))
    await admin.create("roster_entries", { season: S16.id, team: T.u16.id, player: p.id, status: "active" });
}
const ina = await admin.find("players", `section = "${section.id}" && name = "Ina Keller"`);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
async function device(name, time = AFTERNOON) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-DE", timezoneId: "Europe/Berlin" });
  await ctx.clock.setFixedTime(time);
  const page = await ctx.newPage();
  page.on("pageerror", e => check(`${name}: keine Laufzeitfehler`, false, e.message));
  await page.goto(URL);
  return { ctx, page, name };
}
async function login(dev, email) {
  await dev.page.fill("#login-email", email);
  await dev.page.fill("#login-password", PW);
  await dev.page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await dev.page.getByRole("button", { name: /^Mannschaft .* – wechseln$/ }).or(dev.page.getByText("Noch keine Mannschaft")).first().waitFor({ timeout: 15000 });
}
const shot = (dev, n) => dev.page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const storage = (dev, key) => dev.page.evaluate(k => JSON.parse(localStorage.getItem(k) ?? "null"), key);
const synced = dev => dev.page.waitForFunction(() => {
  const m = JSON.parse(localStorage.getItem("trainerhub_sync") ?? "{}");
  return m.lastSync && !(m.errors ?? []).length;
}, null, { timeout: 15000 });
async function openTeam(dev, name) {
  await dev.page.getByRole("button", { name: "Start", exact: true }).last().click();
  await dev.page.getByRole("button", { name: /^Mannschaft .* – wechseln$/ }).click();
  await dev.page.getByRole("dialog").getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await dev.page.getByRole("button", { name: new RegExp(`^Mannschaft ${name}, `) }).waitFor();
}
async function openPlayer(dev, name) {
  await dev.page.getByRole("button", { name: /^Kader/ }).click();
  await dev.page.getByRole("heading", { name: "Kader" }).waitFor();
  await dev.page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await dev.page.getByRole("heading", { name }).waitFor();
}

try {
  // ─── Trainer A ───
  const A = await device("A");
  await login(A, `trainer-a@${DOMAIN}`);
  check("A: 1 Login – Team Workspace ist der Einstieg", true);
  await synced(A);
  // Teamwechsel: U14w ↔ U16w mit wenigen Aktionen
  await openTeam(A, "U14w");
  await openTeam(A, "U16w");
  check("A: 2 Teamwechsel U14w → U16w", await A.page.getByRole("button", { name: /^Mannschaft U16w, Saison 2026\/27/ }).isVisible());
  check("A: 3 aktive Saison 2026/27 ist der Kontext", await A.page.getByText("Saison 2026/27 · Reguläre Saison").isVisible());
  await A.page.getByRole("button", { name: /^Kader/ }).click();
  await A.page.getByRole("heading", { name: "Kader" }).waitFor();
  const names = await A.page.locator(".row__title").allInnerTexts();
  check("A: 4 Saisonkader sichtbar", PLAYERS.every(n => names.includes(n)), names.join(", "));
  await shot(A, "01-kader");
  await A.page.getByRole("button", { name: "Zurück" }).click();

  // 5 Training planen (für heute Abend)
  await A.page.getByRole("button", { name: "Training planen" }).click();
  await A.page.fill("#pl-date", THURSDAY);
  await A.page.fill("#pl-time", "18:30");
  await A.page.fill("#pl-focus", "Pressbreak gegen Ganzfeld");
  await A.page.getByRole("button", { name: "Planen", exact: true }).click();
  await A.page.getByRole("heading", { name: "Planung" }).waitFor();
  check("A: 5 Training geplant", true);

  // 6 Training starten (am Abend in der Halle)
  await A.ctx.clock.setFixedTime(EVENING);
  await A.page.getByRole("button", { name: "Start", exact: true }).last().click();
  await A.page.getByRole("button", { name: "Training starten" }).click();
  await A.page.getByRole("button", { name: "Alle dabei" }).click();
  check("A: 6 Training gestartet, Anwesenheit aus dem Saisonkader", await A.page.getByText(`${PLAYERS.length} von ${PLAYERS.length} dabei`).isVisible());

  // 7 Beobachtung während des Trainings (Person antippen → Text → Speichern)
  await A.page.getByRole("button", { name: "Beobachtung", exact: true }).click();
  await A.page.getByRole("dialog").getByRole("button", { name: "Ina Keller" }).click();
  await A.page.keyboard.type("Öffnet sich nach Ballaufnahme unter Druck zu spät.");
  await A.page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
  await A.page.getByText("Öffnet sich nach Ballaufnahme unter Druck zu spät.").waitFor();
  check("A: 7 Beobachtung während des Trainings erfasst", true);
  await shot(A, "02-training-beobachtung");

  // 8 Training abschließen
  await A.page.getByRole("button", { name: "Training abschließen" }).click();
  await A.page.getByRole("heading", { name: "Training" }).waitFor();
  await A.page.waitForTimeout(2500);   // Sync nach Änderung (verzögert)
  await synced(A);
  const obsSrv = (await admin.list("observations", `team = "${T.u16.id}"`));
  const sessSrv = (await admin.list("sessions", `team = "${T.u16.id}"`))[0];
  check("A: 8 abgeschlossen – Server hat Training und verknüpfte Beobachtung",
    obsSrv.length === 1 && sessSrv && obsSrv[0].session === sessSrv.id && obsSrv[0].player === ina.id && obsSrv[0].createdBy === U.a.id,
    JSON.stringify({ obs: obsSrv.length, session: obsSrv[0]?.session === sessSrv?.id }));

  // ─── Trainer B ───
  const B = await device("B", EVENING);
  await login(B, `trainer-b@${DOMAIN}`);
  check("B: 9 Login im zweiten Browserkontext", true);
  await synced(B);
  check("B: 10 U16w ist direkt geöffnet", await B.page.getByRole("button", { name: /^Mannschaft U16w, / }).isVisible());
  await openPlayer(B, "Ina Keller");
  check("B: 11 dieselbe Spielerin geöffnet", true);
  check("B: 12 sieht die Beobachtung von Trainer A", await B.page.getByText("Öffnet sich nach Ballaufnahme unter Druck zu spät.").isVisible()
    && await B.page.getByText("Trainer A").first().isVisible());
  await shot(B, "03-trainer-b-profil");

  // ─── A offline ───
  await A.page.evaluate(() => navigator.serviceWorker.ready);
  await A.page.getByRole("button", { name: "Start", exact: true }).last().click();
  await A.ctx.setOffline(true);
  check("A: 13 Client offline", true);
  await openPlayer(A, "Ina Keller");
  await A.page.getByRole("button", { name: "Beobachtung", exact: true }).click();
  await A.page.keyboard.type("Offline: Linke Hand unter Druck weiter unsicher.");
  await A.page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
  await A.page.getByText("Offline: Linke Hand unter Druck weiter unsicher.").waitFor();
  check("A: 14 weitere Beobachtung offline erfasst", true);
  await A.page.reload();                                   // App-Neustart ohne Netz (Service Worker)
  await A.page.getByRole("heading", { name: "Ina Keller" }).waitFor({ timeout: 15000 });
  check("A: 15 App-Neustart ohne Netz", true);
  check("A: 16 Beobachtung lokal weiterhin vorhanden", await A.page.getByText("Offline: Linke Hand unter Druck weiter unsicher.").isVisible()
    && (await storage(A, "trainerhub_v1")).observations.some(o => o.text.startsWith("Offline:")));
  await shot(A, "04-offline-nach-neustart");
  check("Server: offline erfasste Beobachtung noch nicht angekommen", !(await admin.list("observations")).some(o => o.text.startsWith("Offline:")));
  await A.ctx.setOffline(false);
  await A.page.evaluate(() => window.dispatchEvent(new Event("online")));
  check("A: 17 wieder verbunden", true);
  await A.page.waitForFunction(() => {
    const d = JSON.parse(localStorage.getItem("trainerhub_v1")); const m = JSON.parse(localStorage.getItem("trainerhub_sync"));
    return m.lastSync && d.observations.length === 2;
  }, null, { timeout: 15000 });
  await A.page.waitForTimeout(1500);
  const offlineSrv = (await admin.list("observations")).find(o => o.text.startsWith("Offline:"));
  check("A: 18 Sync überträgt die Offline-Beobachtung", offlineSrv && offlineSrv.createdBy === U.a.id && offlineSrv.player === ina.id);
  await B.page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));   // B kommt in den Vordergrund
  await B.page.getByText("Offline: Linke Hand unter Druck weiter unsicher.").waitFor({ timeout: 15000 });
  check("B: 19 zweiter Client sieht sie", true);
  await shot(B, "05-trainer-b-sieht-offline-beobachtung");

  // ─── C: fremder Trainer ───
  const C = await device("C", EVENING);
  await login(C, `trainer-c@${DOMAIN}`);
  await synced(C);
  const local = await storage(C, "trainerhub_v1");
  check("C: auf dem Gerät keine U16w-Personen, -Beobachtungen oder -Kader",
    !(local.players ?? []).length && !(local.observations ?? []).length && !(local.rosterEntries ?? []).length && local.teams.map(t => t.name).join() === "U14m",
    JSON.stringify({ teams: local.teams.map(t => t.name), players: (local.players ?? []).length }));
  const meta = await storage(C, "trainerhub_sync");
  const api = await C.page.evaluate(async ({ token, obsId, inaId }) => {
    const h = { Authorization: token };
    const list = await (await fetch("/api/collections/observations/records", { headers: h })).json();
    const one = await fetch(`/api/collections/observations/records/${obsId}`, { headers: h });
    const player = await fetch(`/api/collections/players/records/${inaId}`, { headers: h });
    const roster = await (await fetch("/api/collections/roster_entries/records", { headers: h })).json();
    const create = await fetch("/api/collections/observations/records", { method: "POST", headers: { ...h, "Content-Type": "application/json" },
      body: JSON.stringify({ team: "x", player: inaId, date: "2026-10-01", text: "fremd", createdBy: "x" }) });
    return { n: list.items.length, one: one.status, player: player.status, roster: roster.items.length, create: create.status };
  }, { token: meta.token, obsId: obsSrv[0].id, inaId: ina.id });
  check("C: API liefert keine fremden Beobachtungen/Personen/Kader und verweigert Anlegen",
    api.n === 0 && api.one === 404 && api.player === 404 && api.roster === 0 && api.create >= 400, JSON.stringify(api));
  const anon = await (await fetch(`${URL}/api/collections/observations/records`)).json();
  check("anonym: keine Beobachtungen", (anon.items ?? []).length === 0);
  await shot(C, "06-fremder-trainer");
} catch (err) {
  check("Ablauf ohne Abbruch", false, err.message.split("\n").slice(0, 4).join(" | "));
  for (const ctx of browser.contexts()) for (const [i, pg] of ctx.pages().entries()) await pg.screenshot({ path: `${OUT}/fehler-${browser.contexts().indexOf(ctx)}-${i}.png` }).catch(() => {});
} finally {
  await browser.close();
  writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden`);
  process.exitCode = failed.length ? 1 : 0;
}
