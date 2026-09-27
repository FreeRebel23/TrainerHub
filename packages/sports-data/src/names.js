// Namensvergleich – nur für VORSCHLÄGE an Menschen, nie als Identität oder automatische Zuordnung.

export function normalizeName(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss")
    .toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

const reversed = n => n.split(" ").reverse().join(" ");

// Kandidaten mit gleichem Namen (auch „Nachname Vorname“); getName liest den Namen eines Kandidaten
export function nameCandidates(name, candidates, getName = c => c.name) {
  const n = normalizeName(name);
  if (!n) return [];
  return candidates.filter(c => { const cn = normalizeName(getName(c)); return cn === n || reversed(cn) === n; });
}
