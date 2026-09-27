// TrainerHub-Spielerzuordnung (player_links). Reihenfolge: (1) stabile externe Personen-ID mit
// bestätigter Zuordnung → (2) sonst offen. Namen liefern höchstens Vorschläge für eine manuelle
// Bestätigung – es wird nie automatisch anhand eines Namens zugeordnet.
import { nameCandidates } from "../../packages/sports-data/src/index.js";

export function suggestPlayers(externalName, players) {
  return nameCandidates(externalName, players).map(p => ({ id: p.id, name: p.name }));
}

// Zustand einer Statistikzeile für die Zuordnungsübersicht
export function assignmentState(row, { links = [], players = [] } = {}) {
  const link = links.find(l => l.provider === row.provider && l.externalPlayerId === row.externalPlayerId);
  if (link) return { status: "linked", player: link.player, candidates: [] };
  const linked = new Set(links.map(l => l.player));
  const candidates = suggestPlayers(row.externalName, players.filter(p => !linked.has(p.id)));
  return { status: candidates.length === 0 ? "unknown" : candidates.length === 1 ? "suggested" : "ambiguous", player: null, candidates };
}
