/// <reference path="../pb_data/types.d.ts" />
// TrainerHub – drei technische Berechtigungsprofile mit klarem Scope (siehe
// docs/PHASE3_SYNC_AND_SERVER.md, Abschnitt „Berechtigungen“).
//
//   organisation_admin  = organizations.admins   Scope: ein Verein
//   section_manager     = sections.managers      Scope: eine Abteilung
//   coach               = teams.trainers         Scope: ein Team
//
// Eine Person kann beliebig viele davon parallel besitzen; die Regeln verknüpfen die Profile
// mit ODER, dadurch addieren sich die Rechte. organizations.members ist nur die Zugehörigkeit
// zum Verein (Voraussetzung, um berechtigt zu werden) und gewährt selbst keinen Datenzugriff
// außer dem Vereinsdatensatz. Organisatorische Funktionen („Abteilungsleiter“, „Co-Trainer“ …)
// stehen im Metadatenfeld `functions` und sind nie Berechtigungsquelle.
//
// Änderungen gegenüber 1760000000:
//   – Teams anlegen/löschen: nur section_manager der Abteilung bzw. organisation_admin (nicht coach)
//   – Abteilungen anlegen/ändern/löschen und den Verein ändern: organisation_admin (bisher Superuser)
//   – Abteilungen sehen: nur mit einem Profil darin (bisher: jedes Vereinsmitglied)
//   – Hallen sehen/anlegen/ändern: nur mit einem Profil im Verein (bisher: jedes Vereinsmitglied)
//   – Spieler:innen löschen: zusätzlich section_manager

const ME = "@request.auth.id";
const AUTHED = `${ME} != ""`;
const g = rule => (rule === null ? null : `${AUTHED} && (${rule})`);   // siehe 1760000000: Anmeldeprüfung zuerst

// organisation_admin des Vereins p
const orgAdmin = p => `${p}.admins.id ?= ${ME}`;
// section_manager der Abteilung p oder organisation_admin ihres Vereins
const sectionMgmt = p => `(${p}.managers.id ?= ${ME} || ${p}.organization.admins.id ?= ${ME})`;
// Zugriff auf ein Team: coach, section_manager der Abteilung, organisation_admin des Vereins
const teamAccess = p => { const x = p ? p + "." : ""; return `(${x}trainers.id ?= ${ME} || ${sectionMgmt(x + "section")})`; };
// Zugriff auf eine Abteilung: Leitung/Admin oder coach eines Teams darin (gleiche teams-Zeile)
const sectionAccess = p => `(${sectionMgmt(p)} || (@collection.teams.section ?= ${p} && @collection.teams.trainers.id ?= ${ME}))`;
// irgendein Profil im Verein p (für vereinsweite Stammdaten wie Hallen)
const orgAccess = p => `(${orgAdmin(p)} || ` +
  `(@collection.sections.organization ?= ${p} && @collection.sections.managers.id ?= ${ME}) || ` +
  `(@collection.teams.section.organization ?= ${p} && @collection.teams.trainers.id ?= ${ME}))`;
const unchanged = f => `(@request.body.${f}:isset = false || @request.body.${f} = ${f})`;

const FUNCTIONS_FIELD = { name: "functions", maxSize: 200000 };

function apply(app, name, rules) {
  const c = app.findCollectionByNameOrId(name);
  for (const [k, v] of Object.entries(rules)) c[k] = g(v);
  return c;
}

migrate((app) => {
  // Verein: sichtbar für Zugehörige; ändern (Name, Admins, Mitglieder, Funktionen) nur organisation_admin
  const orgs = apply(app, "organizations", {
    listRule: `(members.id ?= ${ME} || admins.id ?= ${ME})`, viewRule: `(members.id ?= ${ME} || admins.id ?= ${ME})`,
    createRule: null, updateRule: `admins.id ?= ${ME}`, deleteRule: null,
  });
  orgs.fields.add(new JSONField(FUNCTIONS_FIELD));
  app.save(orgs);

  const sections = apply(app, "sections", {
    listRule: `(managers.id ?= ${ME} || organization.admins.id ?= ${ME} || (@collection.teams.section ?= id && @collection.teams.trainers.id ?= ${ME}))`,
    viewRule: `(managers.id ?= ${ME} || organization.admins.id ?= ${ME} || (@collection.teams.section ?= id && @collection.teams.trainers.id ?= ${ME}))`,
    createRule: orgAdmin("organization"),
    updateRule: `${orgAdmin("organization")} && ${unchanged("organization")}`,
    deleteRule: orgAdmin("organization"),
  });
  sections.fields.add(new JSONField(FUNCTIONS_FIELD));
  app.save(sections);

  const teams = apply(app, "teams", {
    listRule: teamAccess(""), viewRule: teamAccess(""),
    createRule: sectionMgmt("section"),
    // coach bearbeitet Teamdaten (Name, Kader); Zuordnungen und Funktionen nur Leitung/Admin
    updateRule: `${teamAccess("")} && ${unchanged("section")}` +
      ` && (@request.body.trainers:isset = false || ${sectionMgmt("section")})` +
      ` && (@request.body.functions:isset = false || ${sectionMgmt("section")})`,
    // Löschen scheitert ohnehin, solange Saisons/Planungen/Trainings auf das Team verweisen
    deleteRule: sectionMgmt("section"),
  });
  teams.fields.add(new JSONField(FUNCTIONS_FIELD));
  app.save(teams);

  app.save(apply(app, "players", {
    listRule: sectionAccess("section"), viewRule: sectionAccess("section"), createRule: sectionAccess("section"),
    updateRule: `${sectionAccess("section")} && ${unchanged("section")}`,
    deleteRule: sectionMgmt("section"),
  }));

  app.save(apply(app, "venues", {
    listRule: orgAccess("organization"), viewRule: orgAccess("organization"), createRule: orgAccess("organization"),
    updateRule: `${orgAccess("organization")} && ${unchanged("organization")}`,
    deleteRule: orgAdmin("organization"),
  }));
  // training_types, seasons, plans, sessions: unverändert (siehe 1760000000)
}, (app) => {
  // Rückbau auf die Regeln von 1760000000
  const member = p => `(${p}.members.id ?= ${ME} || ${p}.admins.id ?= ${ME})`;
  const oldSectionAccess = p => `(${p}.managers.id ?= ${ME} || ${p}.organization.admins.id ?= ${ME} || ` +
    `(@collection.teams.section ?= ${p} && @collection.teams.trainers.id ?= ${ME}))`;
  const orgs = apply(app, "organizations", { updateRule: null });
  orgs.fields.removeByName("functions");
  app.save(orgs);
  const sections = apply(app, "sections", { listRule: member("organization"), viewRule: member("organization"),
    createRule: null, updateRule: null, deleteRule: null });
  sections.fields.removeByName("functions");
  app.save(sections);
  const teams = apply(app, "teams", {
    createRule: oldSectionAccess("section") + ` && @request.body.trainers:length = 1 && @request.body.trainers.id ?= ${ME}`,
    updateRule: teamAccess("") + ` && ${unchanged("section")}` +
      ` && (@request.body.trainers:isset = false || section.managers.id ?= ${ME} || section.organization.admins.id ?= ${ME})`,
    deleteRule: orgAdmin("section.organization"),
  });
  teams.fields.removeByName("functions");
  app.save(teams);
  app.save(apply(app, "players", { deleteRule: orgAdmin("section.organization") }));
  app.save(apply(app, "venues", { listRule: member("organization"), viewRule: member("organization"),
    createRule: member("organization"), updateRule: member("organization") + ` && ${unchanged("organization")}` }));
});
