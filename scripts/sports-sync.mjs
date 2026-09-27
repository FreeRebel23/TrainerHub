// Spielbetrieb & Verbandsdaten – Sync und Zuordnungen (Serveradministration, Superuser-API).
// Architektur: docs/SPORTS_DATA_ARCHITECTURE.md
//
//   PB_URL=… PB_SUPERUSER_EMAIL=… PB_SUPERUSER_PASSWORD=… node scripts/sports-sync.mjs <befehl> [optionen]
//
// Befehle
//   discover --club 484 [--range 21]         Mannschaften/Wettbewerbe des Vereins anzeigen (nur lesen, ohne PocketBase)
//   link-team --team U16w --provider-team 189841 --club 484 [--org …] [--publish]
//                                            Team einmalig der Provider-Mannschaft zuordnen (idempotent)
//   publish --team U16w [--org …] --on|--off Spiele/Tabelle des Teams im öffentlichen Feed zeigen
//   status [--org …]                         Zuordnungen, Wettbewerbe, letzte Läufe
//   run [--section Basketball --org …] [--mode full|gameday]
//                                            Sync einer Abteilung bzw. aller Abteilungen mit Zuordnung
//   players --team U16w [--org …]            offene Spieler-Zuordnungen mit Namensvorschlägen
//   confirm-player --player <id> --external-player <personId>
//                                            Zuordnung manuell bestätigen (nie automatisch)
//
// Ohne Team-Zuordnung wird nichts importiert. Der Sync fragt die Quelle streng nacheinander und
// mit Pausen ab; Fehler landen in sync_runs, vorhandene Daten bleiben erhalten.

import { adminApi } from "./pb-admin.mjs";
import { createBasketballBundProvider, PROVIDER } from "../server/sports/providers/basketball-bund.js";
import { pocketbaseStore, esc } from "../server/sports/store.js";
import { syncSection, syncAll } from "../server/sports/sync.js";
import { assignmentState } from "../server/sports/players.js";

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

async function connect() {
  const { PB_URL = "http://127.0.0.1:18091", PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD } = process.env;
  if (!PB_SUPERUSER_EMAIL || !PB_SUPERUSER_PASSWORD) throw new Error("PB_SUPERUSER_EMAIL und PB_SUPERUSER_PASSWORD setzen.");
  return adminApi(PB_URL, PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD);
}

async function findOne(api, collection, ref, org, orgPath) {
  const r = `(id = "${esc(ref)}" || name = "${esc(ref)}")`;
  const hits = await api.list(collection, org ? `${r} && (${orgPath}.id = "${esc(org)}" || ${orgPath}.name = "${esc(org)}")` : r);
  if (hits.length === 1) return hits[0];
  throw new Error(hits.length ? `„${ref}“ ist mehrdeutig – bitte --org angeben.` : `„${ref}“ nicht gefunden.`);
}
const teamOf = (api, ref, org) => findOne(api, "teams", ref, org, "section.organization");
const sectionOf = (api, ref, org) => findOne(api, "sections", ref, org, "organization");

const commands = {
  async discover(o) {
    if (!o.club) throw new Error("--club fehlt");
    const provider = createBasketballBundProvider();
    const items = await provider.clubMatches(String(o.club), { rangeDays: Number(o.range ?? 21) });
    const teams = new Map();
    for (const { competition, game } of items) for (const side of [game.home, game.away]) {
      if (side.clubId !== String(o.club)) continue;
      const k = `${side.externalId}|${competition.externalId}`;
      if (!teams.has(k)) teams.set(k, { providerTeam: side.externalId, seasonTeamId: side.seasonTeamId, name: side.name,
        competition: competition.externalId, competitionName: competition.name, season: competition.seasonName, games: 0 });
      teams.get(k).games++;
    }
    console.table([...teams.values()].sort((a, b) => a.competitionName.localeCompare(b.competitionName)));
    console.log(`${provider.http.stats.requests} Anfrage(n). Nur Spiele der nächsten ~${o.range ?? 21} Tage; spätere Wettbewerbe erscheinen später.`);
  },

  async "link-team"(o) {
    if (!o.team || !o["provider-team"] || !o.club) throw new Error("--team, --provider-team und --club angeben");
    const api = await connect();
    const team = await teamOf(api, o.team, o.org);
    const existing = await api.find("team_links", `team = "${team.id}" && provider = "${PROVIDER}"`);
    const body = { section: team.section, team: team.id, provider: PROVIDER, externalTeamId: String(o["provider-team"]),
      externalClubId: String(o.club), ...(o.name ? { externalName: o.name } : {}), ...(o.publish ? { publish: true } : {}) };
    const rec = existing ? await api.patch("team_links", existing.id, body) : await api.create("team_links", body);
    console.log(`${existing ? "aktualisiert" : "angelegt"}: ${team.name} ↔ ${PROVIDER} ${rec.externalTeamId} (Verein ${rec.externalClubId})${rec.publish ? ", öffentlich" : ""}`);
  },

  async publish(o) {
    const api = await connect();
    const team = await teamOf(api, o.team, o.org);
    const link = await api.find("team_links", `team = "${team.id}" && provider = "${PROVIDER}"`);
    if (!link) throw new Error("Team ist keiner Provider-Mannschaft zugeordnet (link-team).");
    await api.patch("team_links", link.id, { publish: !o.off });
    console.log(`${team.name}: ${o.off ? "nicht mehr" : "jetzt"} im öffentlichen Feed`);
  },

  async status(o) {
    const api = await connect();
    const orgFilter = o.org ? ` && (section.organization.name = "${esc(o.org)}" || section.organization.id = "${esc(o.org)}")` : "";
    const links = await api.list("team_links", `provider = "${PROVIDER}"${orgFilter}`);
    const teams = new Map((await api.list("teams")).map(t => [t.id, t]));
    console.log("Team-Zuordnungen:");
    console.table(links.map(l => ({ team: teams.get(l.team)?.name, providerTeam: l.externalTeamId, club: l.externalClubId, publish: l.publish })));
    const memberships = await api.list("team_competitions", `provider = "${PROVIDER}"${orgFilter}`);
    const comps = new Map((await api.list("competitions", `provider = "${PROVIDER}"${orgFilter}`)).map(c => [c.id, c]));
    console.log("Wettbewerbe:");
    console.table(memberships.map(m => ({ team: teams.get(m.team)?.name, competition: comps.get(m.competition)?.name,
      liga: comps.get(m.competition)?.externalId, season: comps.get(m.competition)?.seasonName, seasonTeamId: m.externalTeamId, active: m.active })));
    const runs = (await api.call("GET", `/api/collections/sync_runs/records?perPage=5&sort=-startedAt${orgFilter ? "&filter=" + encodeURIComponent(orgFilter.slice(4)) : ""}`)).items;
    console.log("Letzte Läufe:");
    console.table(runs.map(r => ({ start: r.startedAt, mode: r.mode, status: r.status, requests: r.summary?.requests,
      games: JSON.stringify(r.summary?.games), unmapped: r.summary?.unmappedTeams?.length ?? 0, error: r.error.split("\n")[0] })));
  },

  async run(o) {
    const api = await connect();
    const store = pocketbaseStore(api);
    const provider = createBasketballBundProvider();
    const mode = o.mode ?? "full";
    if (!["full", "gameday"].includes(mode)) throw new Error("--mode full|gameday");
    const section = o.section ? (await sectionOf(api, o.section, o.org)).id : null;
    const results = section ? [{ section, ...(await syncSection({ store, provider, section, mode })) }] : await syncAll({ store, provider, mode });
    for (const r of results) {
      const s = r.summary;
      console.log(`[${new Date().toISOString()}] ${r.section} ${mode}: ${r.status} – ${s.requests} Anfragen, ` +
        `Spiele +${s.games.created}/~${s.games.updated}/=${s.games.unchanged} (verlegt ${s.games.rescheduled}, fehlend ${s.games.missing}), ` +
        `Tabellen ${s.standings}, Details ${s.details}, Statistik ${s.stats.games}` +
        (s.skipped ? `, übersprungen: ${s.skipped}` : "") + (s.unmappedTeams.length ? `, ${s.unmappedTeams.length} nicht zugeordnete Mannschaft(en)` : ""));
      for (const e of s.errors) console.error(`  Fehler ${e.step}${e.competition ? " " + e.competition : ""}: ${e.error}`);
    }
    if (results.some(r => r.status === "error")) process.exitCode = 1;
  },

  async players(o) {
    const api = await connect();
    const team = await teamOf(api, o.team, o.org);
    const rows = await api.list("basketball_player_game_stats", `team = "${team.id}" && player = ""`);
    const links = await api.list("player_links", `section = "${team.section}"`);
    const players = await api.list("players", `section = "${team.section}"`);
    const byExt = new Map();
    for (const r of rows) if (!byExt.has(r.externalPlayerId)) byExt.set(r.externalPlayerId, { ...r, games: 0 });
    for (const r of rows) byExt.get(r.externalPlayerId).games++;
    console.table([...byExt.values()].map(r => {
      const st = assignmentState(r, { links, players });
      return { externalPlayerId: r.externalPlayerId, name: r.externalName, number: r.jerseyNumber, games: r.games, status: st.status,
        vorschlag: st.candidates.map(c => `${c.name} (${c.id})`).join(", ") };
    }));
    console.log("Bestätigen: node scripts/sports-sync.mjs confirm-player --player <id> --external-player <personId>");
  },

  async "confirm-player"(o) {
    if (!o.player || !o["external-player"]) throw new Error("--player und --external-player angeben");
    const api = await connect();
    const player = await api.call("GET", `/api/collections/players/records/${encodeURIComponent(o.player)}`);
    const rec = await api.create("player_links", { section: player.section, player: player.id, provider: PROVIDER,
      externalPlayerId: String(o["external-player"]), confirmedAt: new Date().toISOString() });
    console.log(`bestätigt: ${player.name} ↔ ${PROVIDER} Person ${rec.externalPlayerId} (wird beim nächsten Lauf übertragen)`);
  },
};

const o = args(process.argv.slice(2));
const cmd = commands[o._[0]];
if (!cmd) {
  console.log("Befehle: " + Object.keys(commands).join(", ") + " – Details im Kopf dieser Datei.");
  process.exitCode = o._[0] ? 1 : 0;
} else {
  cmd(o).catch(e => { console.error(e.message); process.exitCode = 1; });
}
