// Entwurf des laufenden Trainings. iOS beendet eine PWA im Hintergrund jederzeit (Anruf,
// App-Wechsel) – Anwesenheit und abgehakte Übungen sollen das überstehen. Der Entwurf liegt
// getrennt von den Trainingsdaten und wird nach dem Speichern gelöscht.

const KEY = "trainerhub_draft";
const MAX_AGE_MS = 18 * 60 * 60 * 1000;   // danach gilt ein Entwurf als liegengeblieben

export function draftKey({ planId, date }) { return planId ? `plan:${planId}` : `new:${date ?? ""}`; }

export function saveDraft(key, value, storage = globalThis.localStorage, now = Date.now()) {
  try { storage.setItem(KEY, JSON.stringify({ key, savedAt: now, value })); } catch { /* voll/gesperrt */ }
}

export function loadDraft(key, storage = globalThis.localStorage, now = Date.now()) {
  try {
    const d = JSON.parse(storage.getItem(KEY) ?? "null");
    if (!d || d.key !== key || now - d.savedAt > MAX_AGE_MS) return null;
    return d.value;
  } catch { return null; }
}

export function clearDraft(storage = globalThis.localStorage) {
  try { storage.removeItem(KEY); } catch { /* egal */ }
}
