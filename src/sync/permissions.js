// Welche technischen Berechtigungen hat das angemeldete Konto? Abgeleitet aus den Datensätzen,
// die es sehen darf (organizations.admins, sections.managers, teams.trainers). Nur für die
// Anzeige – entschieden wird ausschließlich serverseitig durch die PocketBase-Regeln.
//
//   organisation_admin → Verein-IDs · section_manager → Abteilungs-IDs · coach → Team-IDs
// Mehrere Einträge je Profil und mehrere Profile gleichzeitig sind normal.

const has = (list, id) => Array.isArray(list) && list.includes(id);

export function permissionSummary(userId, { organizations = [], sections = [], teams = [] } = {}) {
  if (!userId) return { organisationAdmin: [], sectionManager: [], coach: [] };
  return {
    organisationAdmin: organizations.filter(o => has(o.admins, userId)).map(o => o.id),
    sectionManager: sections.filter(s => has(s.managers, userId)).map(s => s.id),
    coach: teams.filter(t => has(t.trainers, userId)).map(t => t.id),
  };
}

// Teams anlegen: section_manager dieser Abteilung oder organisation_admin ihres Vereins – nie coach
export function canCreateTeams(perm, { organizationId, sectionId } = {}) {
  if (!perm) return false;
  return has(perm.sectionManager, sectionId) || has(perm.organisationAdmin, organizationId);
}
