// Schlanker PocketBase-REST-Client (fetch). Bewusst ohne SDK: wenige Endpunkte, volle
// Kontrolle über Timeouts und Fehlerarten, die der Sync unterscheiden muss.

export class SyncError extends Error {
  // kind: offline | auth | forbidden | notfound | invalid | ratelimit | server
  constructor(kind, message, status = 0, data = null) {
    super(message);
    this.kind = kind; this.status = status; this.data = data;
  }
}

function kindOf(status) {
  if (status === 401) return "auth";
  if (status === 403) return "forbidden";
  if (status === 404) return "notfound";
  if (status === 429) return "ratelimit";
  if (status >= 500) return "server";
  return "invalid";
}

export function createClient(baseUrl, { fetchImpl = globalThis.fetch?.bind(globalThis), timeoutMs = 20000 } = {}) {
  let token = null;
  let userId = null;

  async function request(method, path, body) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    let res;
    try {
      res = await fetchImpl(baseUrl + path, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: token } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl?.signal,
      });
    } catch {
      throw new SyncError("offline", "Server nicht erreichbar");
    } finally { if (timer) clearTimeout(timer); }
    if (res.status === 204) return null;
    let data = null;
    try { data = await res.json(); } catch { /* leerer oder kein JSON-Body */ }
    if (!res.ok) throw new SyncError(kindOf(res.status), data?.message ?? `HTTP ${res.status}`, res.status, data);
    return data;
  }

  const rec = (c, id = "") => `/api/collections/${c}/records${id ? "/" + encodeURIComponent(id) : ""}`;

  return {
    get token() { return token; },
    get userId() { return userId; },
    setToken(t) { token = t || null; if (!token) userId = null; },
    async login(email, password) {
      const r = await request("POST", "/api/collections/users/auth-with-password", { identity: email, password });
      token = r.token; userId = r.record?.id ?? null;
      return r;
    },
    async refresh() {
      const r = await request("POST", "/api/collections/users/auth-refresh");
      token = r.token; userId = r.record?.id ?? null;
      return r;
    },
    health: () => request("GET", "/api/health"),
    // Alle sichtbaren Datensätze einer Collection (die API-Regeln filtern serverseitig)
    async listAll(collection, { perPage = 500 } = {}) {
      const items = [];
      for (let page = 1; ; page++) {
        const r = await request("GET", `${rec(collection)}?page=${page}&perPage=${perPage}&skipTotal=1&sort=created`);
        items.push(...(r.items ?? []));
        if ((r.items ?? []).length < perPage) return items;
      }
    },
    get: (c, id) => request("GET", rec(c, id)),
    create: (c, body) => request("POST", rec(c), body),
    update: (c, id, body) => request("PATCH", rec(c, id), body),
    remove: (c, id) => request("DELETE", rec(c, id)),
  };
}

// Anlegen scheiterte, weil die ID schon existiert (z. B. Antwort ging verloren)
export function isDuplicateId(err) {
  return err?.kind === "invalid" && err?.data?.data?.id?.code === "validation_not_unique";
}
