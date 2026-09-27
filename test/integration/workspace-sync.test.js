// Phase 4 über den SyncController (wie die App) gegen eine echte PocketBase: Saisonkader,
// Beobachtungen zweier Trainer, Offline-Erfassung mit App-Neustart, Konflikt, Löschverhalten,
// Spiele aus dem Sports-Data-Adapter (nur lesend) und Mandantentrennung.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPocketBase, seedTenants, memoryStorage, switchableFetch, PASSWORD } from "./harness.js";
import { SyncController } from "../../src/sync/controller.js";
import { recordSession, removeSession } from "../../src/lib/training.js";
import {
  roster, createPlayer, newObservation, addObservation, updateObservation, linkObservations, playerObservations,
  sessionObservations, teamGames, activeSeason,
} from "../../src/lib/workspace.js";

const TODAY = new Date().toISOString().slice(0, 10);
const Y = Number(TODAY.slice(0, 4));
let pb, t, team, season, ina;

function device(email, storage = memoryStorage(), net = switchableFetch()) {
  const c = new SyncController({ serverUrl: pb.url, storage, fetchImpl: net.fetch, delayMs: 60000 });
  return { c, storage, net, email };
}
async function login(email) { const d = device(email); expect(await d.c.login(email, PASSWORD)).toBe("ready"); return d; }
const obsText = d => (d.c.data.observations ?? []).map(o => o.text).sort();

beforeAll(async () => {
  pb = await startPocketBase();
  t = await seedTenants(pb);
  const A = pb.admin;
  ina = await A.create("players", { section: t.basketball.id, name: "Ina" });
  const mia = await A.create("players", { section: t.basketball.id, name: "Mia" });
  team = await A.create("teams", { section: t.basketball.id, name: "U16w", trainers: [t.users.florian.id, t.users.coach.id] });
  season = await A.create("seasons", { team: team.id, name: `${Y}/${Y + 1}`, startDate: `${Y - 1}-07-01`, endDate: `${Y + 1}-06-30`, phase: "saison" });
  for (const p of [ina, mia]) await A.create("roster_entries", { season: season.id, team: team.id, player: p.id, status: "active" });
  // Sports Data (serverseitig vom Adapter befüllt)
  const comp = await A.create("competitions", { section: t.basketball.id, provider: "basketball-bund", externalId: "56442", name: "BBW2 U16 weiblich Bezirksliga" });
  await A.create("games", { section: t.basketball.id, competition: comp.id, awayTeam: team.id, provider: "basketball-bund", externalId: "2959979",
    date: `${Y + 1}-01-10`, time: "14:00", homeTeamName: "Gegner A", awayTeamName: "TV Bretten TITANS", status: "planned" });
}, 60000);
afterAll(() => pb?.stop());

let A, B;
describe("Zwei Trainer:innen im selben Team", () => {
  it("beide sehen Saisonkader und – falls vorhanden – Spiele aus Sports Data", async () => {
    A = await login("florian@test.local");
    B = await login("coach@test.local");
    for (const d of [A, B]) {
      const s = activeSeason(team.id, d.c.data, TODAY);
      expect(s.id).toBe(season.id);
      expect(roster(team.id, s, d.c.data).map(r => r.player.name)).toEqual(["Ina", "Mia"]);
      expect(teamGames(team.id, d.c.data).map(g => [g.source, g.opponent, g.isHome, g.competition]))
        .toEqual([["external", "Gegner A", false, "BBW2 U16 weiblich Bezirksliga"]]);
    }
  });

  it("Beobachtung offline erfassen, App-Neustart, später übertragen – zweite Trainerin sieht sie", async () => {
    A.net.state.online = false;
    const o = newObservation({ teamId: team.id, playerId: ina.id, date: TODAY, text: "Linke Hand unter Druck unsicher", tags: ["Ballhandling"],
      user: A.c.meta.user, authorName: "Florian" });
    A.c.update(d => addObservation(d, o));
    expect(await A.c.sync()).toMatchObject({ state: "offline" });
    expect(A.c.pendingCount).toBe(1);
    // App-Neustart ohne Netz: Beobachtung liegt weiter lokal
    const restarted = device("florian@test.local", A.storage, A.net);
    expect(obsText(restarted)).toEqual(["Linke Hand unter Druck unsicher"]);
    expect(restarted.c.pendingCount).toBe(1);
    A = restarted;
    A.net.state.online = true;
    expect(await A.c.sync()).toMatchObject({ state: "synced" });
    await B.c.sync();
    const seen = playerObservations(ina.id, B.c.data)[0];
    expect(seen).toMatchObject({ text: "Linke Hand unter Druck unsicher", createdBy: t.users.florian.id, authorName: "Florian", tags: ["Ballhandling"] });
  });

  it("Saisonkader: neue Spielerin von B erscheint bei A", async () => {
    B.c.update(d => createPlayer(d, { teamId: team.id, season: activeSeason(team.id, d, TODAY), name: "Zoe", birthYear: 2011 }).data);
    expect(await B.c.sync()).toMatchObject({ state: "synced" });
    await A.c.sync();
    expect(roster(team.id, activeSeason(team.id, A.c.data, TODAY), A.c.data).map(r => r.player.name)).toEqual(["Ina", "Mia", "Zoe"]);
  });

  it("Beobachtung im Training: über die Planung erfasst, beim Abschluss verknüpft; Training gelöscht → Beobachtung bleibt", async () => {
    const plan = { id: "wsplan000000001", teamId: team.id, date: TODAY, durationMinutes: 90, trainingTypeId: "", venueId: null };
    B.c.update(d => ({ ...d, plannedSessions: [...(d.plannedSessions ?? []), plan] }));
    const o = newObservation({ teamId: team.id, playerId: ina.id, date: TODAY, text: "Öffnet sich nach Ballaufnahme zu spät", planId: plan.id, user: B.c.meta.user });
    B.c.update(d => addObservation(d, o));
    await B.c.sync();                                                   // sofort sichtbar, auch vor dem Abschluss
    await A.c.sync();
    expect(obsText(A)).toContain("Öffnet sich nach Ballaufnahme zu spät");
    const sess = { id: "wssess000000001", teamId: team.id, planId: plan.id, date: TODAY, durationMinutes: 90, factor: 1.5, attendance: [{ playerId: ina.id, status: "present" }] };
    B.c.update(d => linkObservations(recordSession(d, sess), [o.id], sess.id));
    expect(await B.c.sync()).toMatchObject({ state: "synced" });
    await A.c.sync();
    expect(sessionObservations(sess, A.c.data).map(x => x.id)).toEqual([o.id]);
    B.c.update(d => removeSession(d, sess.id));
    expect(await B.c.sync()).toMatchObject({ state: "synced" });
    await A.c.sync();
    expect(A.c.data.sessions.some(s => s.id === sess.id)).toBe(false);
    expect(A.c.data.observations.find(x => x.id === o.id)).toMatchObject({ text: "Öffnet sich nach Ballaufnahme zu spät" });
    expect(A.c.data.observations.find(x => x.id === o.id).sessionId ?? "").toBe("");
  });

  it("Konflikt: dieselbe Beobachtung auf zwei Geräten geändert → Serverstand gilt, eigene Fassung bleibt abrufbar", async () => {
    const A2 = await login("florian@test.local");
    const id = playerObservations(ina.id, A.c.data).find(o => o.createdBy === t.users.florian.id).id;
    A.c.update(d => updateObservation(d, id, { text: "Fassung Gerät 1" }));
    A2.c.update(d => updateObservation(d, id, { text: "Fassung Gerät 2" }));
    await A.c.sync();
    await A2.c.sync();
    expect(A2.c.data.observations.find(o => o.id === id).text).toBe("Fassung Gerät 1");
    expect(A2.c.meta.conflicts.at(-1)).toMatchObject({ coll: "observations", id, kind: "field", field: "text", local: "Fassung Gerät 2" });
  });

  it("Spiele aus Sports Data sind nur lesend: lokale Änderungen werden nicht übertragen", async () => {
    A.c.update(d => ({ ...d, externalGames: d.externalGames.map(g => ({ ...g, homeTeamName: "manipuliert" })) }));
    expect(A.c.pendingCount).toBe(0);
    expect(await A.c.sync()).toMatchObject({ state: "synced" });
    expect(A.c.data.externalGames[0].homeTeamName).toBe("Gegner A");
    expect(A.c.meta.errors).toEqual([]);
  });

  it("anderer Verein sieht nichts davon", async () => {
    const O = await login("other@test.local");
    expect(O.c.data.observations ?? []).toEqual([]);
    expect(O.c.data.rosterEntries ?? []).toEqual([]);
    expect(O.c.data.externalGames ?? []).toEqual([]);
    expect((O.c.data.players ?? []).map(p => p.name)).toEqual([]);
  });
});
