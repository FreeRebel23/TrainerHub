// Lokaler Sync-Zustand neben den Trainingsdaten (trainerhub_v1 bleibt unverändert der
// lokale Datenstand bzw. Offline-Cache).
//   trainerhub_sync       – Konto, Kontext (Verein/Abteilung), Status, Konflikte
//   trainerhub_sync_base  – letzter gemeinsamer Stand mit dem Server je Datensatz

const META = "trainerhub_sync";
const BASE = "trainerhub_sync_base";
const MAX_CONFLICTS = 50;

function read(key, storage) {
  try { return JSON.parse(storage.getItem(key) ?? "null"); } catch { return null; }
}
function write(key, value, storage) {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const emptyMeta = () => ({
  v: 1, user: null, token: null, organizationId: null, sectionId: null,
  lastSync: null, conflicts: [], errors: [], held: 0, localOnly: false, bound: false,
});

export function loadMeta(storage = globalThis.localStorage) { return { ...emptyMeta(), ...(read(META, storage) ?? {}) }; }
export function saveMeta(meta, storage = globalThis.localStorage) {
  return write(META, { ...meta, conflicts: (meta.conflicts ?? []).slice(-MAX_CONFLICTS) }, storage);
}
export function loadBase(storage = globalThis.localStorage) { return read(BASE, storage) ?? {}; }
export function saveBase(base, storage = globalThis.localStorage) { return write(BASE, base, storage); }

export function clearSync(storage = globalThis.localStorage) {
  try { storage.removeItem(META); storage.removeItem(BASE); } catch { /* egal */ }
}
