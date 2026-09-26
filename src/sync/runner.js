// Ein Sync-Durchlauf: Serverstand holen → abgleichen → Änderungen übertragen.
// Liefert den neuen lokalen Stand (in Server-Form), den neuen base-Stand, Konflikte und
// Fehler. Speichern und React-Zustand übernimmt der Aufrufer (useSync.js).

import { PUSH_ORDER, recordToFields, toServerSets, same } from "./mapping.js";
import { reconcile, orderOps, sanitizeRelations } from "./engine.js";
import { SyncError, isDuplicateId } from "./client.js";

export async function pullAll(client) {
  const remote = {}, created = {};
  for (const name of PUSH_ORDER) {
    const items = await client.listAll(name);
    const m = new Map();
    items.forEach(r => { m.set(r.id, { f: recordToFields(name, r), u: r.updated }); created[r.id] = r.created; });
    remote[name] = m;
  }
  const organizations = (await client.listAll("organizations")).map(o => ({ id: o.id, name: o.name }));
  const sections = (await client.listAll("sections")).map(s => ({ id: s.id, name: s.name, organizationId: s.organization, sport: s.sport }));
  return { remote, created, organizations, sections };
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
  let interrupted = null;

  for (const op of orderOps(rec.ops)) {
    if (interrupted) break;
    try {
      if (op.type === "create") {
        const body = { id: op.id, ...op.fields };
        if (op.coll === "teams") body.trainers = [ctx.userId];        // neues Team: ich betreue es
        let r;
        try { r = await client.create(op.coll, body); }
        catch (err) {
          if (!isDuplicateId(err)) throw err;
          // ID existiert bereits: sichtbar → übernehmen (nie überschreiben), sonst Fehler
          r = await client.get(op.coll, op.id).catch(() => { throw err; });
          const f = recordToFields(op.coll, r);
          if (!same(f, op.fields)) conflicts.push({ at: now, coll: op.coll, id: op.id, kind: "exists", local: op.fields, server: f });
        }
        created[r.id] = r.created;
        result[op.coll].set(op.id, recordToFields(op.coll, r));
        nextBase[op.coll][op.id] = { f: recordToFields(op.coll, r), u: r.updated };
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

  return {
    result, snapshot, nextBase, conflicts, errors, held: rec.held, interrupted, created,
    organizations: pulled.organizations, sections: pulled.sections,
  };
}
