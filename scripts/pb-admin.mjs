// Verwaltung ohne eigene Admin-Oberfläche in TrainerHub: Verein, Abteilungen, Teams, Konten und
// Berechtigungen. Spricht die PocketBase-API als Superuser an (Serveradministration – getrennt von
// den TrainerHub-Berechtigungen).
//
//   PB_URL=http://127.0.0.1:18091 PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… \
//     node scripts/pb-admin.mjs <befehl> [optionen]
//
// Berechtigungsprofile (technisch) – eine Person kann beliebig viele parallel haben:
//   organisation_admin  Scope: Verein      (--scope "<Verein>")
//   section_manager     Scope: Abteilung   (--scope "<Abteilung>")
//   coach               Scope: Team        (--scope "<Team>")
// Funktionen („Abteilungsleiter“, „Co-Trainer“ …) sind nur Bezeichnungen (--function), keine Rechte.
//
// Befehle
//   bootstrap --org "TV Bretten" --section Basketball [--sport Basketball]
//             Verein + Abteilung anlegen (idempotent), Standard-Trainingsarten/-Hallen
//   user      --email a@b.de --name "Florian" [--org …]           Konto anlegen, dem Verein zuordnen
//   section   --name Handball [--sport …] [--org …]               Abteilung anlegen (idempotent)
//   team      --section Basketball --name U14w [--org …] [--coach a@b.de]   Team anlegen (idempotent)
//   permit    --email a@b.de --profile <profil> --scope <name|id> [--org …] [--function "Titel"]
//   unpermit  --email a@b.de --profile <profil> --scope <name|id> [--org …]
//   function  --email a@b.de --scope-type organisation|section|team --scope <name|id> --function "Titel"|--clear
//   permissions [--email a@b.de]                                  Berechtigungen je Person
//   overview                                                      Verein → Abteilungen → Teams
//   (kompatibel: user --org-admin / --section-manager <Abteilung>, grant|revoke --email … --team …)
//
// Passwörter nie als Argument in die Shell-History schreiben: ohne --password wird eines
// erzeugt und einmalig ausgegeben. Das Skript gibt sonst keine Secrets aus.

import { randomBytes } from "node:crypto";
import { INIT } from "../src/lib/constants.js";

export const PROFILES = {
  organisation_admin: { collection: "organizations", field: "admins" },
  section_manager: { collection: "sections", field: "managers" },
  coach: { collection: "teams", field: "trainers" },
};
const SCOPE_TYPES = { organisation: "organizations", section: "sections", team: "teams" };

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

  async function orgOf(org) {
    const o = org ? await find("organizations", `name = "${esc(org)}" || id = "${esc(org)}"`) : (await list("organizations"))[0];
    if (!o) throw new Error("Verein nicht gefunden – zuerst bootstrap ausführen.");
    return o;
  }
  async function userOf(email) {
    const u = await find("users", `email = "${esc(email)}"`);
    if (!u) throw new Error("Konto nicht gefunden.");
    return u;
  }
  // Scope-Datensatz (Name oder ID). Mit --org nur innerhalb dieses Vereins; ohne --org global,
  // aber nur eindeutig – ein Name, den es in mehreren Vereinen gibt, wird abgelehnt.
  async function scopeOf(collection, ref, org) {
    if (!org) {
      const hits = await list(collection, `id = "${esc(ref)}" || name = "${esc(ref)}"`);
      if (hits.length === 1) return hits[0];
      if (hits.length > 1) throw new Error(`„${ref}“ ist mehrdeutig – bitte --org angeben.`);
      throw new Error(`„${ref}“ nicht gefunden.`);
    }
    const o = await orgOf(org);
    const r = `(name = "${esc(ref)}" || id = "${esc(ref)}")`;
    const rec = collection === "organizations" ? ((o.name === ref || o.id === ref) ? o : null)
      : collection === "sections" ? await find("sections", `organization = "${o.id}" && ${r}`)
      : await find("teams", `section.organization = "${o.id}" && ${r}`);
    if (!rec) throw new Error(`${collection === "teams" ? "Team" : collection === "sections" ? "Abteilung" : "Verein"} „${ref}“ nicht gefunden.`);
    return rec;
  }

  const api = {
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

    // Konto anlegen bzw. ergänzen und dem Verein zuordnen (Zugehörigkeit, noch keine Rechte)
    async user({ email, name = "", password, org, orgAdmin = false, sectionManager = null }) {
      let u = await find("users", `email = "${esc(email)}"`);
      let generated = null;
      if (!u) {
        generated = password ?? randomBytes(12).toString("base64url");
        u = await create("users", { email, name, password: generated, passwordConfirm: generated, verified: true });
      } else if (password) {
        u = await patch("users", u.id, { password, passwordConfirm: password });
      }
      const o = await orgOf(org);
      await patch("organizations", o.id, { "members+": u.id });
      if (orgAdmin) await api.permit({ email, profile: "organisation_admin", scope: o.id, org: o.id });
      if (sectionManager) await api.permit({ email, profile: "section_manager", scope: sectionManager, org: o.id });
      return { user: u, password: password ? null : generated };
    },

    async createSection({ name, sport = name, org }) {
      const o = await orgOf(org);
      return await find("sections", `organization = "${o.id}" && name = "${esc(name)}"`)
        ?? await create("sections", { organization: o.id, name, sport });
    },

    async createTeam({ section, name, org, trainer, coach = trainer }) {
      const s = await scopeOf("sections", section, org);
      const existing = await find("teams", `section = "${s.id}" && name = "${esc(name)}"`);
      const tm = existing ?? await create("teams", { section: s.id, name, trainers: [] });
      if (coach) await api.permit({ email: coach, profile: "coach", scope: tm.id, org });
      return await call("GET", `/api/collections/teams/records/${tm.id}`);
    },

    // Berechtigung vergeben/entziehen: Profil + Scope. Vergeben macht das Konto auch zum Vereinsmitglied.
    async permit({ email, profile, scope, org, title, add = true }) {
      const p = PROFILES[profile];
      if (!p) throw new Error(`Unbekanntes Profil „${profile}“ – erlaubt: ${Object.keys(PROFILES).join(", ")}`);
      const u = await userOf(email);
      const rec = await scopeOf(p.collection, scope, org);
      if (add) {
        const orgId = p.collection === "organizations" ? rec.id
          : p.collection === "sections" ? rec.organization
          : (await call("GET", `/api/collections/sections/records/${rec.section}`)).organization;
        await patch("organizations", orgId, { "members+": u.id });
      }
      const out = await patch(p.collection, rec.id, { [add ? `${p.field}+` : `${p.field}-`]: u.id });
      if (title !== undefined) await api.setFunction({ email, collection: p.collection, id: rec.id, title });
      return { user: u, scope: out };
    },

    // Organisatorische Funktion (reine Bezeichnung) an einem Scope setzen oder entfernen
    async setFunction({ email, collection, id, scopeType, scope, org, title }) {
      const u = await userOf(email);
      const coll = collection ?? SCOPE_TYPES[scopeType];
      if (!coll) throw new Error("--scope-type organisation|section|team angeben.");
      const rec = id ? await call("GET", `/api/collections/${coll}/records/${id}`) : await scopeOf(coll, scope, org);
      const functions = { ...(rec.functions ?? {}) };
      if (title) functions[u.id] = title; else delete functions[u.id];
      return patch(coll, rec.id, { functions });
    },

    // Kompatibel zu älteren Aufrufen: Team-Zugriff = coach
    async grant(email, teamRef, add = true) {
      return (await api.permit({ email, profile: "coach", scope: teamRef, add })).scope;
    },
    async team(ref) {
      return await find("teams", `id = "${esc(ref)}" || name = "${esc(ref)}"`);
    },

    // Berechtigungen je Person: [{ email, name, memberOf, permissions: [{ profile, scope, function }] }]
    async permissions(email) {
      const [orgs, sections, teams, users] = await Promise.all(["organizations", "sections", "teams", "users"].map(c => list(c)));
      const secName = id => sections.find(s => s.id === id)?.name ?? id;
      const orgName = id => orgs.find(o => o.id === id)?.name ?? id;
      return users.filter(u => !email || u.email === email).map(u => {
        const fn = r => r.functions?.[u.id] ?? null;
        const perms = [
          ...orgs.filter(o => o.admins.includes(u.id)).map(o => ({ profile: "organisation_admin", scope: o.name, function: fn(o) })),
          ...sections.filter(s => s.managers.includes(u.id)).map(s => ({ profile: "section_manager", scope: `${orgName(s.organization)} › ${s.name}`, function: fn(s) })),
          ...teams.filter(t => t.trainers.includes(u.id)).map(t => {
            const s = sections.find(x => x.id === t.section);
            return { profile: "coach", scope: `${orgName(s?.organization)} › ${secName(t.section)} › ${t.name}`, function: fn(t) };
          }),
        ];
        // Funktionen ohne Berechtigung (z. B. Vorstand ohne App-Rechte) ebenfalls zeigen
        [...orgs.map(o => ["organisation", o.name, o]), ...sections.map(s => ["section", s.name, s]), ...teams.map(t => ["team", t.name, t])]
          .forEach(([type, name, r]) => { if (fn(r) && !perms.some(p => p.function === fn(r) && p.scope.endsWith(name))) perms.push({ profile: null, scope: `${type}: ${name}`, function: fn(r) }); });
        return { email: u.email, name: u.name, memberOf: orgs.filter(o => o.members.includes(u.id)).map(o => o.name), permissions: perms };
      });
    },

    async overview() {
      const [orgs, sections, teams, users] = await Promise.all(["organizations", "sections", "teams", "users"].map(c => list(c)));
      const mail = id => users.find(u => u.id === id)?.email ?? id;
      return orgs.map(o => ({
        organization: o.name, organisation_admins: o.admins.map(mail), members: o.members.map(mail),
        sections: sections.filter(s => s.organization === o.id).map(s => ({
          section: s.name, section_managers: s.managers.map(mail),
          teams: teams.filter(t => t.section === s.id).map(t => ({ id: t.id, team: t.name, coaches: t.trainers.map(mail), players: t.players.length })),
        })),
      }));
    },
  };
  return api;
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
  const { PB_URL = "http://127.0.0.1:18091", PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD } = process.env;
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
    } else if (cmd === "section") {
      const s = await api.createSection({ name: args.name, sport: args.sport, org: args.org });
      console.log(`Abteilung ${s.name} (${s.id})`);
    } else if (cmd === "team") {
      const tm = await api.createTeam({ section: args.section, name: args.name, org: args.org, coach: args.coach ?? args.trainer });
      console.log(`Team ${tm.name} (${tm.id})`);
    } else if (cmd === "permit" || cmd === "unpermit") {
      const add = cmd === "permit";
      await api.permit({ email: args.email, profile: args.profile, scope: args.scope, org: args.org, add,
        title: add && typeof args.function === "string" ? args.function : undefined });
      console.log(`${add ? "Vergeben" : "Entzogen"}: ${args.profile} · ${args.scope} · ${args.email}`);
    } else if (cmd === "function") {
      await api.setFunction({ email: args.email, scopeType: args.scopeType, scope: args.scope, org: args.org,
        title: args.clear ? null : args.function });
      console.log(args.clear ? "Funktion entfernt" : `Funktion „${args.function}“ gesetzt (keine Berechtigung)`);
    } else if (cmd === "grant" || cmd === "revoke") {
      const t = await api.grant(args.email, args.team, cmd === "grant");
      console.log(`${cmd === "grant" ? "coach vergeben" : "coach entzogen"}: ${args.email} → ${t.name}`);
    } else if (cmd === "permissions") {
      console.log(JSON.stringify(await api.permissions(typeof args.email === "string" ? args.email : undefined), null, 2));
    } else if (cmd === "overview") {
      console.log(JSON.stringify(await api.overview(), null, 2));
    } else {
      console.error("Befehle: bootstrap | user | section | team | permit | unpermit | function | permissions | overview (siehe Kopf der Datei)");
      process.exit(2);
    }
  } catch (err) { console.error(err.message); process.exit(1); }
}
