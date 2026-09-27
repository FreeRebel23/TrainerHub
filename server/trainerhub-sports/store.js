// Datenzugriff des Sync-Jobs auf PocketBase (Superuser-API, nur im internen Netz).
// Bewusst schmal: list/create/update – der Sync entscheidet, was geschrieben wird.

export const esc = s => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export function pocketbaseStore(api) {
  const q = s => encodeURIComponent(s);
  return {
    async list(collection, filter = "", sort = "") {
      const items = [];
      for (let page = 1; ; page++) {
        const res = await api.call("GET", `/api/collections/${collection}/records?perPage=500&page=${page}&skipTotal=1` +
          (filter ? `&filter=${q(filter)}` : "") + (sort ? `&sort=${q(sort)}` : ""));
        items.push(...res.items);
        if (res.items.length < 500) return items;
      }
    },
    create: (collection, body) => api.call("POST", `/api/collections/${collection}/records`, body),
    update: (collection, id, body) => api.call("PATCH", `/api/collections/${collection}/records/${id}`, body),
    remove: (collection, id) => api.call("DELETE", `/api/collections/${collection}/records/${id}`),
  };
}
