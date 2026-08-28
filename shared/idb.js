(function (g) {
  const DB_NAME = "screenshot-studio";
  const VER = 2;
  const STORE = "captures";
  const MAX_KEEP = 30;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function tx(mode, fn) {
    const db = await openDb();
    try {
      return await new Promise((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const store = t.objectStore(STORE);
        const out = fn(store);
        t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
        t.onerror = () => reject(t.error);
        if (out && out.onsuccess) {
          out.onsuccess = () => {};
        }
      });
    } finally {
      db.close();
    }
  }

  async function get(id) {
    const db = await openDb();
    const rec = await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, "readonly");
      const r = t.objectStore(STORE).get(id);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return rec;
  }

  async function put(record) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, "readwrite");
      t.objectStore(STORE).put(record);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
    db.close();
    await prune();
  }

  async function del(id) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, "readwrite");
      t.objectStore(STORE).delete(id);
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
    db.close();
  }

  async function list() {
    const db = await openDb();
    const rows = await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, "readonly");
      const r = t.objectStore(STORE).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    });
    db.close();
    return rows.sort((a, b) => (b.meta && b.meta.createdAt) - (a.meta && a.meta.createdAt));
  }

  async function prune() {
    const rows = await list();
    const fav = rows.filter((r) => r.favorite);
    const rest = rows.filter((r) => !r.favorite);
    if (rest.length <= MAX_KEEP) return;
    const drop = rest.slice(MAX_KEEP);
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, "readwrite");
      drop.forEach((r) => t.objectStore(STORE).delete(r.id));
      t.oncomplete = resolve;
      t.onerror = () => reject(t.error);
    });
    db.close();
    void fav;
  }

  g.SSIDB = { openDb, get, put, del, list, STORE, DB_NAME };
})(typeof window !== "undefined" ? window : self);
