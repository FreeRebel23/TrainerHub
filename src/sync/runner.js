// Ein Sync-Durchlauf: Serverstand holen → abgleichen → Änderungen übertragen.
// Liefert den neuen lokalen Stand (in Server-Form), den neuen base-Stand, Konflikte und
// Fehler. Speichern und React-Zustand übernimmt der Aufrufer (useSync.js).

import { PUSH_ORDER, BY_NAME, recordToFields, toServerSets, same } from "./mapping.js";
import { stableId } from "./legacy.js";
import { reconcile, orderOps, sanitizeRelations } from "./engine.js";
import { SyncError, isDuplicateId } from "./client.js";
import { permissionSummary } from "./permissions.js";

export async function pullAll(client) {
  const remote = {}, created = {};
  let teamRecords = [];
  for (const name of PUSH_ORDER) {
    const items = await client.listAll(name);
    if (name === "teams") teamRecords = items;
    const m = new Map();
    items.forEach(r => { m.set(r.id, { f: recordToFields(name, r), u: r.updated }); created[r.id] = r.created; });
    remote[name] = m;
  }
  const orgRecords = await client.listAll("organizations");
  const sectionRecords = await client.listAll("sections");
  const organizations = orgRecords.map(o => ({ id: o.id, name: o.name }));
  const sections = sectionRecords.map(s => ({ id: s.id, name: s.name, organizationId: s.organization, sport: s.sport }));
  const permissions = permissionSummary(client.userId, { organizations: orgRecords, sections: sectionRecords, teams: teamRecords });
  return { remote, created, organizations, sections, permissions };
}

export const rekeyId = (userId, coll, id) => stableId(userId, coll, id, "rekey");

// Verweise auf umgeschlüsselte Datensätze umstellen (Relationen und Spieler-IDs in der Anwesenheit)
function rewriteRefs(coll, f, remap) {
  let out = f;
  const set = (k, v) => { if (out === f) out = { ...f }; out[k] = v; };
  BY_NAME[coll].fields.forEach(([, s, t, target]) => {
    const m = target && remap[target];
    if (!m?.size) return;
    if (t === "rel" && m.has(f[s])) set(s, m.get(f[s]));
    if (t === "rels" && f[s].some(x => m.has(x))) set(s, f[s].map(x => m.get(x) ?? x));
  });
  if (coll === "sessions" && remap.players?.size && Array.isArray(f.attendance) && f.attendance.some(a => remap.players.has(a?.playerId)))
    set("attendance", f.attendance.map(a => (remap.players.has(a?.playerId) ? { ...a, playerId: remap.players.get(a.playerId) } : a)));
  return out;
}

export async function runSync({ client, data, base, ctx, allowMassDelete = false, now }) {
  const pulled = await pullAll(client);
  const { remote, created } = pulled;
  const fieldsOnly = Object.fromEntries(PUSH_ORDER.map(n => [n, new Map([...remote[n]].map(([id, r]) => [id, r.f]))]));
  const local = sanitizeRelations(toServerSets(data, ctx), fieldsOnly);
  const snapshot = toServerSets(data, ctx);
  const rec = reconcile(local, base, remote, { allowMassDelete, now });
  const { result, nextBase, conflicts } = rec;
  const errors = [];
  const remap = {};       // coll → Map(alte ID → neue ID)
  let interrupted = null;

  for (const op of orderOps(rec.ops)) {
    if (interrupted) break;
    if (op.fields) op.fields = rewriteRefs(op.coll, op.fields, remap);
    try {
      if (op.type === "create") {
        const body = { id: op.id, ...op.fields };
        if (op.coll === "teams") body.trainers = [ctx.userId];        // neues Team: ich betreue es
        let r;
        try { r = await client.create(op.coll, body); }
        catch (err) {
          if (!isDuplicateId(err)) throw err;
          const visible = await client.get(op.coll, op.id).catch(e => { if (e.kind === "notfound") return null; throw e; });
          if (visible) {
            // ID existiert bereits und ist sichtbar (z. B. verlorene Antwort): übernehmen, nie überschreiben
            r = visible;
            const f = recordToFields(op.coll, r);
            if (!same(f, op.fields)) conflicts.push({ at: now, coll: op.coll, id: op.id, kind: "exists", local: op.fields, server: f });
          } else {
            // ID ist in einem anderen Verein/Team vergeben (IDs sind global, z. B. nach altem Datei-Sync):
            // eigener Datensatz bekommt eine neue, deterministische ID; Verweise werden umgestellt
            const newId = rekeyId(ctx.userId, op.coll, op.id);
            try { r = await client.create(op.coll, { ...body, id: newId }); }
            catch (e2) {
              if (!isDuplicateId(e2)) throw e2;
              r = await client.get(op.coll, newId);                   // schon früher umgeschlüsselt: übernehmen
            }
            (remap[op.coll] ??= new Map()).set(op.id, newId);
            result[op.coll].delete(op.id);
          }
        }
        created[r.id] = r.created;
        result[op.coll].set(r.id, recordToFields(op.coll, r));
        nextBase[op.coll][r.id] = { f: recordToFields(op.coll, r), u: r.updated };
      } else if (op.type === "update") {
        const r = await client.update(op.coll, op.id, op.fields);
        result[op.coll].set(op.id, recordToFields(op.coll, r));
        nextBase[op.coll][op.id] = { f: recordToFields(op.coll, r), u: r.updated };
      } else {
        await client.remove(op.coll, op.id).catch(err => { if (err.kind !== "notfound") throw err; });
        delete nextBase[op.coll][op.id];
      }
    } catch (err) {
      if (!(err instanceof SyncError)) throw err;
      if (["offline", "auth", "ratelimit", "server"].includes(err.kind)) { interrupted = err; break; }
      if (op.type === "update" && err.kind === "notfound") {
        // Inzwischen gelöscht oder kein Zugriff mehr: lokale Fassung im Konfliktprotokoll sichern
        result[op.coll].delete(op.id);
        delete nextBase[op.coll][op.id];
        conflicts.push({ at: now, coll: op.coll, id: op.id, kind: "deleted-remote", local: local[op.coll].get(op.id) });
        continue;
      }
      errors.push({ coll: op.coll, id: op.id, type: op.type, kind: err.kind, message: err.message, detail: err.data?.data ?? null });
    }
  }

  // Umschlüsselungen auch im lokalen Ergebnis nachziehen (Datensätze ohne eigene Operation)
  if (Object.keys(remap).length) {
    PUSH_ORDER.forEach(n => result[n].forEach((f, id) => { const g = rewriteRefs(n, f, remap); if (g !== f) result[n].set(id, g); }));
  }

  return {
    result, snapshot, nextBase, remap, conflicts, errors, held: rec.held, interrupted, created,
    organizations: pulled.organizations, sections: pulled.sections, permissions: pulled.permissions,
  };
}
