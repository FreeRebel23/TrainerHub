// Geräteeinstellungen der Oberfläche (nicht synchronisiert): zuletzt geöffnete Mannschaft.
// Getrennt von den Daten (trainerhub_v1), damit ein Teamwechsel keine Sync-Änderung erzeugt.

const KEY = "trainerhub_ui";

export function loadPrefs(storage = globalThis.localStorage) {
  try { return JSON.parse(storage.getItem(KEY) ?? "null") ?? {}; } catch { return {}; }
}

export function savePrefs(patch, storage = globalThis.localStorage) {
  try { storage.setItem(KEY, JSON.stringify({ ...loadPrefs(storage), ...patch })); } catch { /* voll/gesperrt */ }
}

// Aktuelle Mannschaft: ausdrücklich gewählt → zuletzt verwendet → eigenes Team (coach) → erstes Team
export function currentTeamId(teams, { requested = null, mine = null, storage } = {}) {
  const ids = new Set((teams ?? []).map(t => t.id));
  const last = loadPrefs(storage).teamId;
  return [requested, last, ...(mine ?? []), teams?.[0]?.id].find(id => id && ids.has(id)) ?? null;
}
