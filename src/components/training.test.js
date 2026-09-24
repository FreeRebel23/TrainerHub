import { describe, it, expect } from "vitest";
import { quickToggle } from "./training.jsx";

describe("Anwesenheit antippen", () => {
  it("schaltet fitte Spieler:innen zwischen dabei und fehlt", () => {
    expect(quickToggle("absent", false)).toBe("present");
    expect(quickToggle("excused", false)).toBe("present");
    expect(quickToggle("present", false)).toBe("absent");
  });
  it("führt Verletzte als verletzt-dabei bzw. verletzt-nicht-da", () => {
    expect(quickToggle("injured_absent", true)).toBe("injured_present");
    expect(quickToggle("injured_present", true)).toBe("injured_absent");
  });
});
