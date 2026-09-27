#!/usr/bin/env node
// Eigenständige CLI der Capability: gibt normalisierte Objekte (src/model.js) als JSON auf stdout aus.
// Für Verbraucher in anderen Sprachen (z. B. GameDay/Python per subprocess) – ohne TrainerHub,
// ohne PocketBase, ohne Konfiguration.
//
//   sports-data club-matches --club 484 [--range 21]
//   sports-data club-games   --club 484 [--range 21] [--details]   Vereinsspiele inkl. Viertel/Halle
//   sports-data schedule     --competition 56442
//   sports-data standings    --competition 56442
//   sports-data game         --id 2946251                          Viertel, Halle
//   sports-data boxscore     --id 2946251
//   Optionen: --user-agent "GameDay/2.0 (…)"  --interval 1500 (ms zwischen Anfragen)
//
// Ausgabe: { schemaVersion, provider, command, fetchedAt, requests, data }. Fehler: JSON auf stderr, Exit 1.

import { createBasketballBundProvider, politeHttp, basketballBund, SCHEMA_VERSION } from "../src/index.js";

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

const need = (o, k) => { if (!o[k] || o[k] === true) throw new Error(`--${k} fehlt`); return String(o[k]); };

const commands = {
  "club-matches": (p, o) => p.clubMatches(need(o, "club"), { rangeDays: Number(o.range ?? 21) }),
  async "club-games"(p, o) {
    const club = need(o, "club");
    const items = await p.clubMatches(club, { rangeDays: Number(o.range ?? 21) });
    if (!o.details) return items;
    const out = [];
    for (const it of items) out.push({ ...it, details: await p.gameDetails(it.game.externalId) });   // nacheinander
    return out;
  },
  schedule: (p, o) => p.schedule(need(o, "competition")),
  standings: (p, o) => p.standings(need(o, "competition")),
  game: (p, o) => p.gameDetails(need(o, "id")),
  boxscore: (p, o) => p.boxscore(need(o, "id")),
};

const o = args(process.argv.slice(2));
const cmd = commands[o._[0]];
if (!cmd) {
  process.stderr.write(`Befehle: ${Object.keys(commands).join(", ")}\n`);
  process.exit(o._[0] ? 1 : 0);
}
const http = politeHttp({ baseUrl: basketballBund.BASE_URL, minIntervalMs: Number(o.interval ?? 1500),
  ...(o["user-agent"] ? { userAgent: String(o["user-agent"]) } : {}) });
const provider = createBasketballBundProvider({ http });
try {
  const data = await cmd(provider, o);
  process.stdout.write(JSON.stringify({ schemaVersion: SCHEMA_VERSION, provider: provider.id, command: o._[0],
    fetchedAt: new Date().toISOString(), requests: http.stats.requests, data }, null, 1) + "\n");
} catch (e) {
  process.stderr.write(JSON.stringify({ error: e.message, name: e.name, notFound: !!e.notFound, status: e.status ?? null }) + "\n");
  process.exit(1);
}
