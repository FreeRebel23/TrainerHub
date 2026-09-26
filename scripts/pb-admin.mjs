// Verwaltung ohne eigene Admin-Oberfläche in TrainerHub: Verein, Abteilung, Konten und
// Team-Zugriffe anlegen. Spricht die PocketBase-API als Superuser an.
//
//   PB_URL=http://127.0.0.1:8091 PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… \
//     node scripts/pb-admin.mjs <befehl> [optionen]
//
// Befehle
//   bootstrap --org "TV Bretten" --section Basketball [--sport Basketball]
//             legt Verein + Abteilung an (idempotent) und die Standard-Trainingsarten/-Hallen
//   user      --email a@b.de --name "Florian" [--password …] [--org-admin] [--section-manager]
//             legt ein Konto an bzw. ergänzt es und macht es zum Vereinsmitglied
//   team      --section Basketball --name U14w [--org …] [--trainer a@b.de]   Team anlegen
//   grant     --email a@b.de --team <team-id|Teamname>   Team-Zugriff geben
//   revoke    --email a@b.de --team <team-id|Teamname>   Team-Zugriff entziehen
//   overview  zeigt Vereine, Abteilungen, Teams und Zugriffe
//
// Passwörter nie als Argument in die Shell-History schreiben: ohne --password wird eines
// erzeugt und einmalig ausgegeben.

import { randomBytes } from "node:crypto";
import { INIT } from "../src/lib/constants.js";

export async function adminApi(url, email, password, fetchImpl = fetch) {
  async function req(method, path, body, token) {
    const r = await fetchImpl(url + path, {
      method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${JSON.stringify(data)}`);
    return data;
  }
  const { token } = await req("POST", "/api/collections/_superusers/auth-with-password", { identity: email, password });
  const call = (m, p, b) => req(m, p, b, token);
  const q = s => encodeURIComponent(s);
  const find = async (c, filter) => (await call("GET", `/api/collections/${c}/records?perPage=1&filter=${q(filter)}`)).items[0] ?? null;
  const list = async (c, filter = "") => (await call("GET", `/api/collections/${c}/records?perPage=500${filter ? "&filter=" + q(filter) : ""}`)).items;
  const create = (c, b) => call("POST", `/api/collections/${c}/records`, b);
  const patch = (c, id, b) => call("PATCH", `/api/collections/${c}/records/${id}`, b);
  const esc = s => String(s).replace(/"/g, '\\"');

  return {
    call, find, list, create, patch,
    async bootstrap({ org, section, sport = section, seedDefaults = true }) {
      const o = await find("organizations", `name = "${esc(org)}"`) ?? await create("organizations", { name: org });
      const s = await find("sections", `organization = "${o.id}" && name = "${esc(section)}"`)
        ?? await create("sections", { organization: o.id, name: section, sport });
      if (seedDefaults) {
        if (!(await list("training_types", `section = "${s.id}"`)).length)
          for (const t of INIT.trainingTypes) await create("training_types", { section: s.id, name: t.name, duration: t.duration });
        if (!(await list("venues", `organization = "${o.id}"`)).length)
          for (const v of INIT.venues) await create("venues", { organization: o.id, name: v.name, address: v.address ?? "" });
      }
      return { organization: o, section: s };
    },
    async user({ email, name = "", password, org, orgAdmin = false, sectionManager = null }) {
      let u = await find("users", `email = "${esc(email)}"`);
      let generated = null;
      if (!u) {
        generated = password ?? randomBytes(12).toString("base64url");
        u = await create("users", { email, name, password: generated, passwordConfirm: generated, verified: true });
      } else if (password) {
        u = await patch("users", u.id, { password, passwordConfirm: password });
      }
      const o = org ? await find("organizations", `name = "${esc(org)}" || id = "${esc(org)}"`) : (await list("organizations"))[0];
      if (!o) throw new Error("Verein nicht gefunden – zuerst bootstrap ausführen.");
      await patch("organizations", o.id, { "members+": u.id, ...(orgAdmin ? { "admins+": u.id } : {}) });
      if (sectionManager) {
        const s = await find("sections", `organization = "${o.id}" && (name = "${esc(sectionManager)}" || id = "${esc(sectionManager)}")`);
        if (!s) throw new Error("Abteilung nicht gefunden.");
        await patch("sections", s.id, { "managers+": u.id });
      }
      return { user: u, password: password ? null : generated };
    },
    async createTeam({ section, name, org, trainer }) {
      const o = org ? await find("organizations", `name = "${esc(org)}" || id = "${esc(org)}"`) : (await list("organizations"))[0];
      const s = o && await find("sections", `organization = "${o.id}" && (name = "${esc(section)}" || id = "${esc(section)}")`);
      if (!s) throw new Error("Abteilung nicht gefunden.");
      const u = trainer ? await find("users", `email = "${esc(trainer)}"`) : null;
      if (trainer && !u) throw new Error("Konto nicht gefunden.");
      return create("teams", { section: s.id, name, trainers: u ? [u.id] : [] });
    },
    async team(ref) {
      return await find("teams", `id = "${esc(ref)}" || name = "${esc(ref)}"`);
    },
    async grant(email, teamRef, add = true) {
      const u = await find("users", `email = "${esc(email)}"`);
      const t = await this.team(teamRef);
      if (!u || !t) throw new Error("Konto oder Team nicht gefunden.");
      return patch("teams", t.id, { [add ? "trainers+" : "trainers-"]: u.id });
    },
    async overview() {
      const [orgs, sections, teams, users] = await Promise.all(["organizations", "sections", "teams", "users"].map(c => list(c)));
      const mail = id => users.find(u => u.id === id)?.email ?? id;
      return orgs.map(o => ({
        organization: o.name, admins: o.admins.map(mail), members: o.members.map(mail),
        sections: sections.filter(s => s.organization === o.id).map(s => ({
          section: s.name, managers: s.managers.map(mail),
          teams: teams.filter(t => t.section === s.id).map(t => ({ id: t.id, team: t.name, trainers: t.trainers.map(mail), players: t.players.length })),
        })),
      }));
    },
  };
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) out[k] = true; else { out[k] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const { PB_URL = "http://127.0.0.1:8091", PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD } = process.env;
  if (!PB_SUPERUSER_EMAIL || !PB_SUPERUSER_PASSWORD) {
    console.error("PB_SUPERUSER_EMAIL und PB_SUPERUSER_PASSWORD als Umgebungsvariablen setzen.");
    process.exit(2);
  }
  const api = await adminApi(PB_URL, PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD);
  const cmd = args._[0];
  try {
    if (cmd === "bootstrap") {
      const r = await api.bootstrap({ org: args.org, section: args.section, sport: args.sport });
      console.log(`Verein ${r.organization.name} (${r.organization.id}) · Abteilung ${r.section.name} (${r.section.id})`);
    } else if (cmd === "user") {
      const r = await api.user({ email: args.email, name: args.name ?? "", password: args.password, org: args.org, orgAdmin: !!args.orgAdmin, sectionManager: args.sectionManager });
      console.log(`Konto ${r.user.email} (${r.user.id})` + (r.password ? ` – Startpasswort: ${r.password}` : ""));
    } else if (cmd === "team") {
      const tm = await api.createTeam({ section: args.section, name: args.name, org: args.org, trainer: args.trainer });
      console.log(`Team ${tm.name} (${tm.id})`);
    } else if (cmd === "grant" || cmd === "revoke") {
      const t = await api.grant(args.email, args.team, cmd === "grant");
      console.log(`${cmd === "grant" ? "Zugriff erteilt" : "Zugriff entzogen"}: ${args.email} → ${t.name}`);
    } else if (cmd === "overview") {
      console.log(JSON.stringify(await api.overview(), null, 2));
    } else {
      console.error("Befehle: bootstrap | user | team | grant | revoke | overview (siehe Kopf der Datei)");
      process.exit(2);
    }
  } catch (err) { console.error(err.message); process.exit(1); }
}
