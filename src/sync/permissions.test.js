import { describe, it, expect } from "vitest";
import { permissionSummary, canCreateTeams } from "./permissions.js";

const data = {
  organizations: [{ id: "oa", admins: ["admin"] }, { id: "ob", admins: [] }],
  sections: [{ id: "bb", managers: ["mgr", "multi"] }, { id: "hb", managers: [] }],
  teams: [{ id: "u14", trainers: ["coach", "multi"] }, { id: "u16", trainers: ["multi"] }, { id: "h1", trainers: [] }],
};

describe("Berechtigungen aus sichtbaren Datensätzen", () => {
  it("mehrere Profile und mehrere Scopes gleichzeitig", () => {
    expect(permissionSummary("multi", data)).toEqual({ organisationAdmin: [], sectionManager: ["bb"], coach: ["u14", "u16"] });
    expect(permissionSummary("admin", data)).toEqual({ organisationAdmin: ["oa"], sectionManager: [], coach: [] });
    expect(permissionSummary(null, data)).toEqual({ organisationAdmin: [], sectionManager: [], coach: [] });
  });

  it("Teams anlegen nur als Leitung der Abteilung oder Admin des Vereins, nie als coach", () => {
    const ctx = { organizationId: "oa", sectionId: "bb" };
    expect(canCreateTeams(permissionSummary("mgr", data), ctx)).toBe(true);
    expect(canCreateTeams(permissionSummary("admin", data), { organizationId: "oa", sectionId: "hb" })).toBe(true);
    expect(canCreateTeams(permissionSummary("coach", data), ctx)).toBe(false);
    expect(canCreateTeams(permissionSummary("mgr", data), { organizationId: "oa", sectionId: "hb" })).toBe(false);
    expect(canCreateTeams(undefined, ctx)).toBe(false);
  });

  it("fehlende Felder (ältere Serverstände) führen nicht zu Fehlern", () => {
    expect(permissionSummary("x", { organizations: [{ id: "o" }], sections: [{ id: "s" }], teams: [{ id: "t" }] }))
      .toEqual({ organisationAdmin: [], sectionManager: [], coach: [] });
  });
});
