// Browser-Ende-zu-Ende für Phase 3 gegen einen laufenden TrainerHub-Stack (deploy/compose.yaml).
//
//   E2E_URL=http://127.0.0.1:18090 PB_URL=http://127.0.0.1:18091 \
//   PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… E2E_PASSWORD_A=… E2E_PASSWORD_B=… E2E_PASSWORD_C=… \
//   node e2e/phase3.e2e.mjs
//
// Erwartet: Verein mit Abteilungen Basketball und Handball, Konten florian@/coach@/hand@<E2E_DOMAIN>
// (Florian Vereins-Admin, hand@ Trainer eines Handball-Teams), noch keine Basketball-Teams.
// Playwright wird nicht als Projektabhängigkeit installiert: `npm i -g playwright` bzw.
// PLAYWRIGHT_MODULE=/pfad/zu/playwright.
//
// Ablauf (Auftrag Phase 3, Punkt 48):
//  A  altes Gerät mit Phase-2-Daten: anmelden, Daten übernehmen, Training für Donnerstag planen, vorbereiten
//  A2 zweites Gerät: anmelden, dieselbe Planung sehen
//  B  zweiter Trainer mit Zugriff auf das Team: Planung sehen
//  C  Trainer ohne Zugriff (anderes Team/Abteilung): nichts davon sehen – auch nicht über die API
//  A  offline in der Halle (App-Neustart ohne Netz): Training starten, Anwesenheit, Übung abhaken, abschließen
//  A  wieder online: Änderungen werden übertragen
//  A2 sieht das abgeschlossene Training

import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { adminApi } from "../scripts/pb-admin.mjs";
import { INIT } from "../src/lib/constants.js";

const require = createRequire(import.meta.url);
const { chromium } = await import("playwright").catch(() => require(process.env.PLAYWRIGHT_MODULE ?? "playwright"));

const URL = process.env.E2E_URL ?? "http://127.0.0.1:18090";
const DOMAIN = process.env.E2E_DOMAIN ?? "localtest.dev";
const OUT = process.env.E2E_OUT ?? "e2e-output";
const PW = { A: process.env.E2E_PASSWORD_A, B: process.env.E2E_PASSWORD_B, C: process.env.E2E_PASSWORD_C };
const TUESDAY = new Date("2026-09-29T10:00:00+02:00");
const THURSDAY_EVENING = new Date("2026-10-01T18:40:00+02:00");
const THURSDAY = "2026-10-01";

mkdirSync(OUT, { recursive: true });
const results = [];
function check(name, ok, info = "") { results.push({ name, ok: !!ok, info }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? " – " + info : ""}`); }

const admin = await adminApi(process.env.PB_URL, process.env.PB_SUPERUSER_EMAIL, process.env.PB_SUPERUSER_PASSWORD);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });

async function device(name, { legacy = null, time = TUESDAY } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "de-DE", timezoneId: "Europe/Berlin" });
  await ctx.clock.setFixedTime(time);
  const page = await ctx.newPage();
  page.on("pageerror", e => check(`${name}: keine Laufzeitfehler`, false, e.message));
  if (legacy) await ctx.addInitScript(d => { if (!localStorage.getItem("trainerhub_v1")) localStorage.setItem("trainerhub_v1", d); }, JSON.stringify(legacy));
  await page.goto(URL);
  return { ctx, page, name };
}
async function login(dev, email, password) {
  await dev.page.fill("#login-email", email);
  await dev.page.fill("#login-password", password);
  await dev.page.getByRole("button", { name: "Anmelden", exact: true }).click();
}
const shot = (dev, n) => dev.page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
const storage = (dev, key) => dev.page.evaluate(k => JSON.parse(localStorage.getItem(k) ?? "null"), key);
async function openBook(dev) {
  await dev.page.getByRole("button", { name: "Training", exact: true }).last().click();
  await dev.page.waitForTimeout(300);
}

// Phase-2-Gerätestand (wie auf dem bisherigen iPhone)
const legacy = JSON.parse(JSON.stringify(INIT));
legacy.settings = { trainerName: "Florian" };
legacy.sessions = [{ id: "e2esess00000001", teamId: "t0", trainingTypeId: "tt1", date: "2026-09-22", durationMinutes: 90, factor: 1.5, venueId: "v1",
  attendance: INIT.players.map(p => ({ playerId: p.id, status: "present" })), note: "Altes Training aus Phase 2", checklist: [], focus: "Wurf", tags: ["Wurf"] }];

try {
  // ─── A: altes Gerät ───
  const A = await device("A", { legacy });
  await A.page.getByLabel("E-Mail").waitFor();
  check("A: Anmeldemaske beim ersten Start", await A.page.getByRole("heading", { name: "TrainerHub" }).isVisible());
  await login(A, `florian@${DOMAIN}`, PW.A);
  await A.page.getByRole("heading", { name: "Daten übernehmen" }).waitFor();
  await A.page.getByText("Noch keine Teams und Trainings.").waitFor();
  await shot(A, "01-migration");
  check("A: Übernahme zeigt lokalen Bestand", await A.page.getByText("1 Team · 5 Spieler:innen · 1 Trainings · 0 Planungen").isVisible());
  await A.page.getByRole("button", { name: "Daten übernehmen" }).click();
  await A.page.getByText("Zuletzt trainiert").waitFor();
  check("A: nach Übernahme in der normalen App", await A.page.getByText("Wurf").first().isVisible());
  // Die App ist sofort nutzbar; der Upload läuft im Hintergrund weiter
  await A.page.waitForFunction(() => JSON.parse(localStorage.getItem("trainerhub_sync") ?? "{}").lastSync, null, { timeout: 15000 });
  const teamsOnServer = await admin.list("teams");
  const u16 = teamsOnServer.find(t => t.name === "U16w");
  check("Server: Team, Spieler und Training übernommen", u16 && u16.players.length === 5 && (await admin.list("sessions")).some(s => s.id === "e2esess00000001"));

  // Training für Donnerstag planen und vorbereiten
  await openBook(A);
  await A.page.getByRole("button", { name: "Planen" }).click();
  await A.page.fill("#pl-date", THURSDAY);
  await A.page.fill("#pl-time", "18:30");
  await A.page.fill("#pl-focus", "Pressbreak gegen Ganzfeld");
  await A.page.fill("#drill-input", "3-gegen-2 Überzahl");
  await A.page.keyboard.press("Enter");
  await A.page.fill("#drill-input", "Abschlussspiel");
  await A.page.keyboard.press("Enter");
  await A.page.getByRole("button", { name: "Planen", exact: true }).click();
  await A.page.getByRole("heading", { name: "Planung" }).waitFor();
  await shot(A, "02-planung");
  await A.page.waitForFunction(() => { const m = JSON.parse(localStorage.getItem("trainerhub_sync") ?? "{}"); return m.lastSync; });
  await A.page.waitForTimeout(2500);   // Sync nach Änderung (verzögert)
  const plans = await admin.list("plans");
  const plan = plans.find(p => p.focus === "Pressbreak gegen Ganzfeld");
  check("Server: Planung mit Uhrzeit, Schwerpunkt und Übungen", plan && plan.date === THURSDAY && plan.time === "18:30" && plan.checklist.length === 2, JSON.stringify(plan?.checklist?.map(d => d.text)));

  // ─── A2: zweites Gerät desselben Trainers ───
  const A2 = await device("A2");
  await login(A2, `florian@${DOMAIN}`, PW.A);
  await A2.page.getByText("Zuletzt trainiert").waitFor();
  await openBook(A2);
  await A2.page.getByText("Pressbreak gegen Ganzfeld").waitFor({ timeout: 10000 });
  check("A2: dieselbe Planung auf zweitem Gerät", true);
  await shot(A2, "03-zweites-geraet");

  // ─── B: zweiter Trainer mit Zugriff ───
  await admin.grant(`coach@${DOMAIN}`, u16.id, true);
  const B = await device("B");
  await login(B, `coach@${DOMAIN}`, PW.B);
  await B.page.getByText("Zuletzt trainiert").waitFor();
  await openBook(B);
  await B.page.getByText("Pressbreak gegen Ganzfeld").waitFor({ timeout: 10000 });
  check("B: Co-Trainer sieht die gemeinsame Planung", true);

  // ─── C: Trainer ohne Zugriff ───
  const C = await device("C");
  await login(C, `hand@${DOMAIN}`, PW.C);
  await C.page.getByText("Zuletzt trainiert").waitFor();
  await openBook(C);
  check("C: sieht die Planung nicht", !(await C.page.getByText("Pressbreak gegen Ganzfeld").isVisible()));
  const meta = await storage(C, "trainerhub_sync");
  const api = await C.page.evaluate(async ({ token, planId, sessId }) => {
    const h = { Authorization: token };
    const list = await (await fetch("/api/collections/plans/records", { headers: h })).json();
    const one = await fetch(`/api/collections/plans/records/${planId}`, { headers: h });
    const sess = await fetch(`/api/collections/sessions/records/${sessId}`, { headers: h });
    const patch = await fetch(`/api/collections/plans/records/${planId}`, { method: "PATCH", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ focus: "gehackt" }) });
    return { n: list.items.length, one: one.status, sess: sess.status, patch: patch.status };
  }, { token: meta.token, planId: plan.id, sessId: "e2esess00000001" });
  check("C: API liefert keine fremden Daten und verweigert Änderungen", api.n === 0 && api.one === 404 && api.sess === 404 && api.patch === 404, JSON.stringify(api));
  const teamsC = (await storage(C, "trainerhub_v1")).teams.map(t => t.name);
  check("C: nur eigenes Team auf dem Gerät", teamsC.length === 1 && teamsC[0] === "Handball D-Jugend", teamsC.join(","));

  // ─── A offline in der Halle am Donnerstag ───
  await A.page.evaluate(() => navigator.serviceWorker.ready);
  await A.ctx.clock.setFixedTime(THURSDAY_EVENING);
  await A.ctx.setOffline(true);
  await A.page.reload();                                   // App-Neustart ohne Netz (Service Worker)
  await A.page.getByRole("button", { name: "Start", exact: true }).last().click();   // Reload behält die letzte Ansicht
  await A.page.getByText("Zuletzt trainiert").waitFor();
  check("A offline: App startet ohne Netz mit lokalen Daten", true);
  await A.page.getByRole("button", { name: "Training starten" }).first().click();
  await A.page.getByRole("button", { name: "Alle dabei" }).click();
  await A.page.getByRole("button", { name: /^Lena Berg:/ }).click();          // verletzt → nicht da
  await A.page.getByRole("button", { name: "3-gegen-2 Überzahl abhaken" }).click();
  await A.page.getByRole("button", { name: "Notiz hinzufügen" }).click();
  await A.page.getByLabel("Beobachtungen und Notizen").fill("Offline in der Halle erfasst");
  await shot(A, "04-offline-training");
  await A.page.getByRole("button", { name: "Training abschließen" }).click();
  await A.page.waitForTimeout(800);
  await A.page.getByRole("button", { name: "Mehr" }).click();
  const offlineText = await A.page.getByRole("status").first().innerText();
  check("A offline: Änderung wartet auf Übertragung", /Offline|warte|nicht übertragen/.test(offlineText), offlineText);
  await shot(A, "05-offline-status");
  const pendingSess = (await storage(A, "trainerhub_v1")).sessions.find(s => s.note === "Offline in der Halle erfasst");
  check("A offline: Training lokal gespeichert und mit Planung verknüpft", pendingSess && pendingSess.planId === plan.id);

  // ─── wieder online ───
  await A.ctx.setOffline(false);
  await A.page.evaluate(() => window.dispatchEvent(new Event("online")));
  await A.page.getByText(/Synchronisiert/).waitFor({ timeout: 15000 });
  const srv = (await admin.list("sessions")).find(s => s.id === pendingSess.id);
  check("Server: Offline-Training angekommen (Anwesenheit, Übungen, Planung)", srv && srv.plan === plan.id && srv.attendance.filter(a => a.status === "present").length === 4 && srv.checklist[0].done === true,
    JSON.stringify({ plan: srv?.plan, att: srv?.attendance?.length }));
  await shot(A, "06-synchronisiert");

  // ─── A2 sieht das Ergebnis ───
  await A2.page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));   // App kommt in den Vordergrund
  await A2.page.waitForFunction(id => (JSON.parse(localStorage.getItem("trainerhub_v1")).sessions ?? []).some(s => s.id === id), pendingSess.id, { timeout: 15000 });
  await A2.page.getByRole("button", { name: "Start", exact: true }).last().click();
  await A2.page.getByText("Zuletzt trainiert").waitFor();
  const a2 = await storage(A2, "trainerhub_v1");
  check("A2: abgeschlossenes Training sichtbar, Planung gilt als durchgeführt",
    a2.sessions.some(s => s.id === pendingSess.id) && a2.plannedSessions.find(p => p.id === plan.id)?.recordedId === pendingSess.id);
  await shot(A2, "07-zweites-geraet-ergebnis");

  // Phase-2-Funktionen im Servermodus: Suche und Saisonübersicht
  await openBook(A2);
  await A2.page.fill("#book-search", "halle erfasst");
  check("A2: Suche findet das Offline-Training über seine Notiz", await A2.page.getByText("Oktober 2026").isVisible());
  await A2.page.getByRole("button", { name: "Auswertung" }).last().click();
  // Florian ist Vereins-Admin und sieht daher auch das Handball-Team – U16w auswählen
  const chip = A2.page.getByRole("button", { name: "U16w" });
  if (await chip.count()) await chip.first().click();
  await A2.page.getByText("Häufigste Schwerpunkte").waitFor({ timeout: 5000 }).catch(() => {});
  check("A2: Saisonübersicht zeigt Themen und Schwerpunkte", await A2.page.getByText("Wurf").first().isVisible() && await A2.page.getByText("Pressbreak gegen Ganzfeld").first().isVisible());
  await shot(A2, "08-saisonuebersicht");
} catch (err) {
  check("Ablauf ohne Abbruch", false, err.message.split("\n")[0]);
  for (const ctx of browser.contexts()) for (const [i, pg] of ctx.pages().entries()) await pg.screenshot({ path: `${OUT}/fehler-${browser.contexts().indexOf(ctx)}-${i}.png` }).catch(() => {});
} finally {
  await browser.close();
  writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden`);
  process.exitCode = failed.length ? 1 : 0;
}
