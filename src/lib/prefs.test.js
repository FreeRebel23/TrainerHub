import { describe, it, expect } from "vitest";
import { currentTeamId, savePrefs, loadPrefs } from "./prefs.js";

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const teams = [{ id: "u14" }, { id: "u16" }, { id: "u18" }];

describe("aktuelle Mannschaft", () => {
  it("gewählt → zuletzt verwendet → eigenes Team → erstes; unbekannte IDs werden ignoriert", () => {
    const s = mem();
    expect(currentTeamId(teams, { storage: s })).toBe("u14");
    expect(currentTeamId(teams, { mine: ["u16"], storage: s })).toBe("u16");
    savePrefs({ teamId: "u18" }, s);
    expect(currentTeamId(teams, { mine: ["u16"], storage: s })).toBe("u18");
    expect(currentTeamId(teams, { requested: "u16", storage: s })).toBe("u16");
    savePrefs({ teamId: "weg" }, s);
    expect(currentTeamId(teams, { mine: ["u16"], storage: s })).toBe("u16");
    expect(loadPrefs(s)).toEqual({ teamId: "weg" });
    expect(currentTeamId([], { storage: s })).toBeNull();
  });
});
