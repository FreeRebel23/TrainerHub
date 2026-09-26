// Sync-Kern: Dreiwege-Abgleich zwischen lokalem Stand, letztem gemeinsamen Stand ("base")
// und Serverstand. Reine Funktionen – Netzwerk und Speicher liegen in client.js/store.js.
//
// Regeln (ausführlich in docs/PHASE3_SYNC_AND_SERVER.md):
//  – Ausstehend ist, was lokal von base abweicht. Es gibt keine Warteschlange, die verloren
//    gehen oder doppelt ausgeführt werden kann; der Zustand selbst ist die Wahrheit.
//  – Beide Seiten geändert → Abgleich je Feld. Nur echte Kollisionen (gleiches Feld, beide
//    geändert, verschiedene Werte) sind Konflikte: der Serverwert gilt, der lokale Wert wird im
//    Konfliktprotokoll aufbewahrt und kann übernommen werden. Nichts verschwindet still.
//  – Löschen: lokal gelöscht und auf dem Server unverändert → auf dem Server löschen.
//    Auf dem Server inzwischen geändert → nicht löschen (Konflikt).
//    Auf dem Server gelöscht → lokal entfernen; ungesicherte lokale Änderungen landen im
//    Konfliktprotokoll.

import { COLLECTIONS, BY_NAME, PUSH_ORDER, same } from "./mapping.js";

const emptySets = () => Object.fromEntries(PUSH_ORDER.map(n => [n, new Map()]));

// Verweise auf Datensätze, die es weder auf dem Server noch lokal gibt, würden vom Server
// abgelehnt (z. B. Training → gelöschte Planung). Sie werden geleert statt den Sync zu blockieren.
export function sanitizeRelations(local, remote) {
  const known = n => id => local[n]?.has(id) || remote?.[n]?.has(id);
  PUSH_ORDER.forEach(name => {
    const spec = BY_NAME[name];
    const rels = spec.fields.filter(([, , t]) => t === "rel" || t === "rels");
    if (!rels.length) return;
    local[name].forEach((f, id) => {
      let changed = null;
      rels.forEach(([, s, t, target]) => {
        const ok = known(target);
        if (t === "rel" && f[s] && !ok(f[s])) (changed ??= { ...f })[s] = "";
        if (t === "rels" && f[s].some(x => !ok(x))) (changed ??= { ...f })[s] = f[s].filter(ok);
      });
      if (changed) local[name].set(id, changed);
    });
  });
  return local;
}

// Was ist lokal noch nicht auf dem Server? (für die Statusanzeige, ohne Netzwerk)
export function pendingChanges(local, base) {
  const out = [];
  PUSH_ORDER.forEach(name => {
    const b = base[name] ?? {};
    local[name].forEach((f, id) => {
      if (!b[id]) out.push({ coll: name, id, type: "create" });
      else if (!same(f, b[id].f)) out.push({ coll: name, id, type: "update" });
    });
    Object.keys(b).forEach(id => { if (!local[name].has(id)) out.push({ coll: name, id, type: "delete" }); });
  });
  return out;
}

function mergeFields(L, B, R, conflict) {
  const out = {};
  new Set([...Object.keys(L), ...Object.keys(R)]).forEach(k => {
    const l = L[k], b = B?.[k], r = R[k];
    if (same(l, b)) out[k] = r;
    else if (same(r, b) || same(l, r)) out[k] = l;
    else { out[k] = r; conflict(k, l, r); }
  });
  return out;
}

function diffFields(a, b) {
  const out = {};
  Object.keys(a).forEach(k => { if (!same(a[k], b?.[k])) out[k] = a[k]; });
  return out;
}

// Abgleich. local/remote: { coll: Map(id → Felder) }, remote-Werte als { f, u }.
// base: { coll: { id: { f, u } } }. Ergebnis: gewünschter lokaler Stand, auszuführende
// Serveroperationen, neuer base-Stand für unveränderte Datensätze und Konflikte.
export function reconcile(local, base, remote, { now = new Date().toISOString(), allowMassDelete = false } = {}) {
  const result = emptySets();
  const nextBase = Object.fromEntries(PUSH_ORDER.map(n => [n, {}]));
  const ops = [];
  const conflicts = [];
  const note = (c) => conflicts.push({ at: now, ...c });

  PUSH_ORDER.forEach(name => {
    const L = local[name] ?? new Map(), B = base[name] ?? {}, R = remote[name] ?? new Map();
    const ids = new Set([...L.keys(), ...Object.keys(B), ...R.keys()]);
    ids.forEach(id => {
      const l = L.get(id), b = B[id], r = R.get(id);
      const localChanged = l && (!b || !same(l, b.f));
      const remoteChanged = r && b && r.u !== b.u;

      if (l && !b && !r) { result[name].set(id, l); ops.push({ type: "create", coll: name, id, fields: l }); return; }
      if (!l && !b && r) { result[name].set(id, r.f); nextBase[name][id] = r; return; }
      if (l && !b && r) {
        // Gibt es auf dem Server schon (z. B. verlorene Antwort, Zusammenführen): nie überschreiben
        result[name].set(id, r.f); nextBase[name][id] = r;
        if (!same(l, r.f)) note({ coll: name, id, kind: "exists", local: l, server: r.f });
        return;
      }
      if (!l && b && !r) return;                                     // beidseitig gelöscht
      if (l && b && !r) {                                            // auf dem Server gelöscht
        if (localChanged) note({ coll: name, id, kind: "deleted-remote", local: l });
        return;
      }
      if (!l && b && r) {                                            // lokal gelöscht
        if (remoteChanged) {
          result[name].set(id, r.f); nextBase[name][id] = r;
          note({ coll: name, id, kind: "delete-rejected", server: r.f });
        } else {
          nextBase[name][id] = b;                                      // bis zur Bestätigung
          ops.push({ type: "delete", coll: name, id });
        }
        return;
      }
      // l && b && r
      if (!localChanged) { result[name].set(id, r.f); nextBase[name][id] = r; return; }
      if (!remoteChanged) {
        result[name].set(id, l); nextBase[name][id] = b;             // bis zur Bestätigung
        ops.push({ type: "update", coll: name, id, fields: diffFields(l, b.f) });
        return;
      }
      const merged = mergeFields(l, b.f, r.f, (field, lv, rv) =>
        note({ coll: name, id, kind: "field", field, local: lv, server: rv, localRecord: l }));
      result[name].set(id, merged); nextBase[name][id] = r;          // Konflikt nur einmal melden
      const patch = diffFields(merged, r.f);
      if (Object.keys(patch).length) ops.push({ type: "update", coll: name, id, fields: patch, base: r });
      else nextBase[name][id] = r;
    });
  });

  // Sicherheitsbremse: ungewöhnlich viele Löschungen (z. B. falsches Backup eingespielt)
  // werden erst nach ausdrücklicher Bestätigung übertragen.
  let held = [];
  if (!allowMassDelete) {
    PUSH_ORDER.forEach(name => {
      const dels = ops.filter(o => o.type === "delete" && o.coll === name);
      const size = Object.keys(base[name] ?? {}).length;
      if (dels.length > 5 && dels.length > size * 0.25) held = held.concat(dels);
    });
  }
  const heldSet = new Set(held);

  return { result, ops: ops.filter(o => !heldSet.has(o)), nextBase, conflicts, held };
}

// Reihenfolge: Anlegen/Ändern mit Abhängigkeiten zuerst, Löschen umgekehrt
export function orderOps(ops) {
  const rank = n => PUSH_ORDER.indexOf(n);
  const writes = ops.filter(o => o.type !== "delete").sort((a, b) => rank(a.coll) - rank(b.coll));
  const deletes = ops.filter(o => o.type === "delete").sort((a, b) => rank(b.coll) - rank(a.coll));
  return [...writes, ...deletes];
}

// Änderungen, die während eines laufenden Syncs lokal passiert sind, gewinnen gegenüber dem
// Sync-Ergebnis (sie werden im nächsten Durchlauf übertragen).
export function rebase(current, snapshot, synced) {
  const out = emptySets();
  PUSH_ORDER.forEach(name => {
    const C = current[name], S = snapshot[name], Y = synced[name];
    Y.forEach((f, id) => {
      const touched = !same(C.get(id), S.get(id));
      if (!touched) out[name].set(id, f);
    });
    C.forEach((f, id) => {
      const touched = !same(f, S.get(id));
      if (touched) out[name].set(id, f);                // lokal geändert oder neu
    });
    S.forEach((f, id) => { if (!C.has(id)) out[name].delete(id); });   // lokal gelöscht
  });
  return out;
}

export { COLLECTIONS };
