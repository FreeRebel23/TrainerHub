// Höflicher HTTP-Client für externe Verbandsquellen (Teil von packages/sports-data):
//   – streng nacheinander (keine Parallelität), Mindestabstand zwischen zwei Anfragen
//   – Timeout, wenige Wiederholungen nur bei Netzwerkfehlern/5xx/429, mit Pause
//   – Antwort-Cache pro Lauf (dieselbe URL wird in einem Lauf nur einmal abgerufen)
//   – ehrlicher User-Agent; keine Cookies, keine Umgehung von Schutzmechanismen

export class ProviderError extends Error {
  constructor(message, { status = null, url = null, notFound = false } = {}) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
    this.url = url;
    this.notFound = notFound;
  }
}

// Verbraucher setzen einen eigenen, ehrlichen User-Agent (z. B. „TrainerHub-Sync/1.0 …“, „GameDay/…“)
export const DEFAULT_USER_AGENT = "sports-data/1.0 (Vereinsnutzung, seltene Abrufe)";

export function politeHttp({
  baseUrl, fetchImpl = fetch, minIntervalMs = 1500, timeoutMs = 15000, retries = 2,
  userAgent = DEFAULT_USER_AGENT, sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now(),
} = {}) {
  let queue = Promise.resolve();
  let last = -Infinity;
  const cache = new Map();
  const stats = { requests: 0, cached: 0, failures: 0 };

  async function once(url) {
    const wait = last + minIntervalMs - now();
    if (wait > 0) await sleep(wait);
    last = now();
    stats.requests++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { headers: { "User-Agent": userAgent, Accept: "application/json" }, signal: ctrl.signal });
    } finally { clearTimeout(timer); }
  }

  async function fetchJson(path) {
    const url = baseUrl + path;
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await sleep(minIntervalMs * 2 * attempt);
      let res;
      try {
        res = await once(url);
      } catch (e) {
        lastError = new ProviderError(`Quelle nicht erreichbar: ${e.message}`, { url });
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        lastError = new ProviderError(`HTTP ${res.status}`, { status: res.status, url });
        continue;
      }
      if (!res.ok) throw new ProviderError(`HTTP ${res.status}`, { status: res.status, url, notFound: res.status === 404 });
      try {
        return await res.json();
      } catch {
        throw new ProviderError("Antwort ist kein JSON", { status: res.status, url });
      }
    }
    stats.failures++;
    throw lastError;
  }

  return {
    stats,
    // Serialisiert: auch gleichzeitige Aufrufe laufen strikt nacheinander
    getJson(path) {
      if (cache.has(path)) { stats.cached++; return cache.get(path); }
      const p = queue.then(() => fetchJson(path));
      queue = p.catch(() => {});
      cache.set(path, p);
      p.catch(() => cache.delete(path));
      return p;
    },
  };
}
