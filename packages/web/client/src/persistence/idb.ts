/**
 * IndexedDB wrapper for the Crawler's media cache (captured raws +
 * rendered composites). Single shared DB, two object stores keyed by
 * composite string keys.
 *
 * Why IDB: localStorage holds session config (small JSON), but a real
 * App Store set is 8 screens × 4 templates × 2 themes ≈ 64 PNGs at
 * ~200 KB each = ~12 MB. localStorage caps at ~5 MB and stores strings
 * (which would force base64 expansion). IDB stores Blobs natively at
 * native size with quotas in the gigabytes on Chrome/Firefox/Safari.
 *
 * Keys are caller-supplied composite strings like
 * `${screenId}::${templateId}::${theme}` — the persistence layer
 * doesn't care about the shape.
 *
 * No third-party dep — `idb` (the popular wrapper) is nice but adds
 * 6 KB gzipped for what's a 70-line shim.
 */

const DB_NAME = "shotcraft.crawler.v1";
const DB_VERSION = 1;
export const STORE_CAPTURES = "captures";
export const STORE_COMPOSITES = "composites";
export type IdbStore = typeof STORE_CAPTURES | typeof STORE_COMPOSITES;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolveDb, rejectDb) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CAPTURES)) {
        db.createObjectStore(STORE_CAPTURES);
      }
      if (!db.objectStoreNames.contains(STORE_COMPOSITES)) {
        db.createObjectStore(STORE_COMPOSITES);
      }
    };
    req.onsuccess = () => resolveDb(req.result);
    req.onerror = () => rejectDb(req.error ?? new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

export async function putBlob(store: IdbStore, key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolveOp, rejectOp) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).put(blob, key);
    tx.oncomplete = () => resolveOp();
    tx.onerror = () => rejectOp(tx.error ?? new Error(`IDB put failed for ${key}`));
    tx.onabort = () => rejectOp(tx.error ?? new Error(`IDB put aborted for ${key}`));
  });
}

export async function getBlob(store: IdbStore, key: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise<Blob | null>((resolveOp, rejectOp) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => {
      const v: unknown = req.result;
      resolveOp(v instanceof Blob ? v : null);
    };
    req.onerror = () => rejectOp(req.error ?? new Error(`IDB get failed for ${key}`));
  });
}

export async function deleteBlob(store: IdbStore, key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolveOp, rejectOp) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolveOp();
    tx.onerror = () => rejectOp(tx.error ?? new Error(`IDB delete failed for ${key}`));
  });
}

/**
 * Returns all entries in a store as a `[key, blob]` map. Used on
 * Crawler mount to rehydrate state in one transaction (faster than
 * many round-trip gets).
 */
export async function getAllEntries(store: IdbStore): Promise<Map<string, Blob>> {
  const db = await openDb();
  return new Promise<Map<string, Blob>>((resolveOp, rejectOp) => {
    const tx = db.transaction(store, "readonly");
    const objStore = tx.objectStore(store);
    const out = new Map<string, Blob>();
    const cursorReq = objStore.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) {
        resolveOp(out);
        return;
      }
      if (typeof cursor.key === "string" && cursor.value instanceof Blob) {
        out.set(cursor.key, cursor.value);
      }
      cursor.continue();
    };
    cursorReq.onerror = () => rejectOp(cursorReq.error ?? new Error("IDB cursor failed"));
  });
}

/** Wipe a single store. Used by "Forget saved settings". */
export async function clearStore(store: IdbStore): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolveOp, rejectOp) => {
    const tx = db.transaction(store, "readwrite");
    tx.objectStore(store).clear();
    tx.oncomplete = () => resolveOp();
    tx.onerror = () => rejectOp(tx.error ?? new Error(`IDB clear failed for ${store}`));
  });
}

/**
 * Bulk delete keys matching a prefix. Used when removing a screen —
 * all captures + composites for that screen need to go.
 */
export async function deleteByPrefix(store: IdbStore, prefix: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolveOp, rejectOp) => {
    const tx = db.transaction(store, "readwrite");
    const objStore = tx.objectStore(store);
    const cursorReq = objStore.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (!cursor) return;
      if (typeof cursor.key === "string" && cursor.key.startsWith(prefix)) {
        cursor.delete();
      }
      cursor.continue();
    };
    tx.oncomplete = () => resolveOp();
    tx.onerror = () => rejectOp(tx.error ?? new Error(`IDB prefix delete failed for ${prefix}`));
  });
}

/** Composite key helper — captures + composites both use this shape. */
export function mediaKey(screenId: string, templateId: string, theme: "dark" | "light"): string {
  return `${screenId}::${templateId}::${theme}`;
}
