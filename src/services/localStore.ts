/**
 * DUO BLOCKS — local key-value store (zero external dependencies).
 *
 * Persistence ladder:
 *   1. IndexedDB  (db 'duo-blocks', object store 'kv')
 *   2. localStorage (private-mode fallback when IndexedDB is unavailable)
 *   3. in-memory Map (last resort — survives the session only)
 *
 * Every layer is best-effort: a storage failure never throws out of get/set.
 */

export type LocalStoreKey = 'profile' | 'progress' | 'pendingWrites';

const DB_NAME = 'duo-blocks';
const KV_STORE = 'kv';
const DB_VERSION = 1;

/** Hot copy used when both IndexedDB and localStorage are unavailable. */
const memory = new Map<string, unknown>();

function hasIdb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function hasLs(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage !== null;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// IndexedDB layer
// ---------------------------------------------------------------------------

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(KV_STORE)) {
        req.result.createObjectStore(KV_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
    req.onblocked = () => reject(new Error('indexedDB open blocked'));
  });
}

function idbGet<T>(key: string): Promise<T | undefined> {
  return new Promise<T | undefined>((resolve, reject) => {
    openDb().then((db) => {
      try {
        const tx = db.transaction(KV_STORE, 'readonly');
        const req = tx.objectStore(KV_STORE).get(key);
        req.onsuccess = () => {
          db.close();
          resolve(req.result as T | undefined);
        };
        req.onerror = () => {
          db.close();
          reject(req.error ?? new Error('indexedDB get failed'));
        };
      } catch (err) {
        try { db.close(); } catch { /* ignore */ }
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }, reject);
  });
}

function idbSet(key: string, value: unknown): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    openDb().then((db) => {
      try {
        const tx = db.transaction(KV_STORE, 'readwrite');
        tx.objectStore(KV_STORE).put(value, key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('indexedDB put failed'));
        };
        tx.onabort = () => {
          try { db.close(); } catch { /* ignore */ }
          reject(tx.error ?? new Error('indexedDB put aborted'));
        };
      } catch (err) {
        try { db.close(); } catch { /* ignore */ }
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }, reject);
  });
}

// ---------------------------------------------------------------------------
// localStorage layer
// ---------------------------------------------------------------------------

function lsKey(key: string): string {
  return `${DB_NAME}:${key}`;
}

function lsGet(key: string): unknown {
  const raw = localStorage.getItem(lsKey(key));
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined; // corrupt entry — treat as missing
  }
}

function lsSet(key: string, value: unknown): void {
  localStorage.setItem(lsKey(key), JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function get<T>(key: LocalStoreKey, fallback: T): Promise<T> {
  if (hasIdb()) {
    try {
      const value = await idbGet<T>(key);
      if (value !== undefined) return value;
      // key absent in IndexedDB — still prefer it over the colder layers
      return fallback;
    } catch {
      /* fall through to localStorage */
    }
  }
  if (hasLs()) {
    try {
      const value = lsGet(key);
      if (value !== undefined) return value as T;
      return fallback;
    } catch {
      /* fall through to memory */
    }
  }
  return memory.has(key) ? (memory.get(key) as T) : fallback;
}

export async function set(key: LocalStoreKey, value: unknown): Promise<void> {
  memory.set(key, value); // keep a hot copy so this session always reads its own writes
  if (hasIdb()) {
    try {
      await idbSet(key, value);
      return;
    } catch {
      /* fall through */
    }
  }
  if (hasLs()) {
    try {
      lsSet(key, value);
      return;
    } catch {
      /* fall through */
    }
  }
  // memory-only: next session will not see this write; acceptable in fully
  // sandboxed environments (the game still runs, progress is session-scoped).
}

// ---------------------------------------------------------------------------
// Pending-write queue (offline reconciliation markers)
// ---------------------------------------------------------------------------

export interface PendingWriteRecord {
  id: string;
  label: string;
  createdAt: string;
}

let pendingCache: PendingWriteRecord[] | null = null;

export async function readPendingWrites(): Promise<PendingWriteRecord[]> {
  if (pendingCache) return pendingCache;
  const stored = await get<PendingWriteRecord[]>('pendingWrites', []);
  pendingCache = Array.isArray(stored) ? stored : [];
  return pendingCache;
}

export async function writePendingWrites(records: PendingWriteRecord[]): Promise<void> {
  pendingCache = records;
  await set('pendingWrites', records);
}
