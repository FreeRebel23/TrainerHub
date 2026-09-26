// Gemeinsame Prüfungen für permissions.pb.js (PocketBase-Hooks laufen isoliert, daher per require).
// Invariante: Berechtigt werden kann nur, wer dem Verein angehört (organizations.members).
// Damit kann z. B. eine Abteilungsleitung kein Konto eines fremden Vereins zum coach machen.

function slice(rec, field) {
  const v = rec ? rec.get(field) : null;
  return Array.isArray(v) ? v.map(String) : [];
}

// IDs, die in diesem Request neu hinzukommen (beim Anlegen: alle)
function added(e, field, isNew) {
  const now = slice(e.record, field);
  if (isNew) return now;
  const before = new Set(slice(e.record.original(), field));
  return now.filter(id => !before.has(id));
}

function orgMembers(app, orgId) {
  const org = app.findRecordById("organizations", orgId);
  return new Set([...slice(org, "members"), ...slice(org, "admins")]);
}

function requireMembers(app, orgId, ids, what) {
  if (!ids.length) return;
  const members = orgMembers(app, orgId);
  const foreign = ids.filter(id => !members.has(id));
  if (foreign.length) {
    throw new BadRequestError(`${what}: Konto gehört nicht zum Verein.`, { [what]: { code: "not_member", message: "Nur Vereinsmitglieder." } });
  }
}

module.exports = {
  // Verein: organisation_admin ist immer auch Mitglied
  organization(e) {
    const members = new Set(slice(e.record, "members"));
    const admins = slice(e.record, "admins");
    if (admins.some(a => !members.has(a))) e.record.set("members", [...new Set([...members, ...admins])]);
  },
  // Abteilung: section_manager muss Vereinsmitglied sein
  section(e, isNew) {
    requireMembers(e.app, e.record.getString("organization"), added(e, "managers", isNew), "managers");
  },
  // Team: coach muss Mitglied des Vereins der Abteilung sein
  team(e, isNew) {
    const section = e.app.findRecordById("sections", e.record.getString("section"));
    requireMembers(e.app, section.getString("organization"), added(e, "trainers", isNew), "trainers");
  },
};
