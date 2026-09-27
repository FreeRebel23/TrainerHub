import { describe, it, expect } from "vitest";
import { assignmentState, suggestPlayers } from "./players.js";

describe("TrainerHub-Spielerzuordnung: nie automatisch über Namen", () => {
  const players = [{ id: "p1", name: "Lena Muster" }, { id: "p2", name: "Lena Muster" }, { id: "p3", name: "Mia Beispiel" }];
  it("Namen liefern nur Vorschläge; gleiche Namen sind mehrdeutig", () => {
    expect(suggestPlayers("Beispiel Mia", players)).toEqual([{ id: "p3", name: "Mia Beispiel" }]);
    expect(assignmentState({ provider: "x", externalPlayerId: "9", externalName: "Lena Muster" }, { players }).status).toBe("ambiguous");
    expect(assignmentState({ provider: "x", externalPlayerId: "9", externalName: "Mia Beispiel" }, { players })).toMatchObject({ status: "suggested", player: null });
  });
  it("bestätigte Zuordnung über externe ID hat Vorrang", () => {
    const links = [{ provider: "x", externalPlayerId: "9", player: "p2" }];
    expect(assignmentState({ provider: "x", externalPlayerId: "9", externalName: "Irgendwer" }, { players, links })).toMatchObject({ status: "linked", player: "p2" });
  });
});
