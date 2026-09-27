// Spieler-Zuordnung. Reihenfolge: (1) stabile externe Personen-ID mit bestätigter Zuordnung
// (player_links) → (2) sonst offen. Namen liefern höchstens Vorschläge für eine manuelle
// Bestätigung – es wird nie automatisch anhand eines Namens zugeordnet.

export function normalizeName(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss")
    .toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

const reversed = n => n.split(" ").reverse().join(" ");

// Vorschläge für eine Statistikzeile: gleiche Namen (auch „Nachname Vorname“) in der Abteilung
export function suggestPlayers(externalName, players) {
  const n = normalizeName(externalName);
  if (!n) return [];
  return players.filter(p => {
    const pn = normalizeName(p.name);
    return pn === n || reversed(pn) === n;
  }).map(p => ({ id: p.id, name: p.name }));
}

// Zustand einer Statistikzeile für die Zuordnungsübersicht
export function assignmentState(row, { links = [], players = [] } = {}) {
  const link = links.find(l => l.provider === row.provider && l.externalPlayerId === row.externalPlayerId);
  if (link) return { status: "linked", player: link.player, candidates: [] };
  const linked = new Set(links.map(l => l.player));
  const candidates = suggestPlayers(row.externalName, players.filter(p => !linked.has(p.id)));
  return { status: candidates.length === 0 ? "unknown" : candidates.length === 1 ? "suggested" : "ambiguous", player: null, candidates };
}
