// Persistence for user-added docsets, in IndexedDB (docset bytes can be large).
// All calls are best-effort: if IndexedDB is unavailable they resolve to no-ops
// so the bundled docsets still work.

const DB_NAME = "kdhelp";
const STORE = "docsets";
const VERSION = 1;

export interface StoredDocset {
  id: string;
  language: string;
  title: string;
  bytes: Uint8Array;
  /** Product/family key — used for per-collection language selection. Older
   *  records predate this field; callers fall back to `id`. */
  collection?: string;
  /** Content version (`meta.version`); may be absent on older records. */
  version?: string;
  /** Sidecar `.khba` attachment packs uploaded alongside the docset. */
  attachments?: Uint8Array[];
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("language", "language", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return undefined;
  }
}

export async function putDocset(d: StoredDocset): Promise<void> {
  await withStore("readwrite", (s) => s.put(d));
}

export async function deleteDocset(id: string): Promise<void> {
  await withStore("readwrite", (s) => s.delete(id));
}

export async function allDocsets(): Promise<StoredDocset[]> {
  return (await withStore<StoredDocset[]>("readonly", (s) => s.getAll())) ?? [];
}

export async function docsetsByLanguage(
  language: string,
): Promise<StoredDocset[]> {
  const all = await allDocsets();
  return all.filter((d) => d.language === language);
}

// Remote (online) docsets are persisted as URLs and re-fetched each session,
// unlike uploaded docsets (bytes cached in IndexedDB). Kept in localStorage.
// `streaming` remotes are opened page-by-page over HTTP Range (never fetched
// whole). Legacy entries were bare URL strings (= whole-fetch); still accepted.
const REMOTES_KEY = "kdhelp.remotes";

export interface RemoteEntry {
  url: string;
  streaming?: boolean;
  /** Sidecar `.khba` pack URLs (streaming remotes only). */
  attachments?: string[];
}

export function getRemotes(): RemoteEntry[] {
  try {
    const raw = localStorage.getItem(REMOTES_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    return list.flatMap((e): RemoteEntry[] => {
      if (typeof e === "string") return [{ url: e }];
      const entry = e as RemoteEntry;
      if (e && typeof entry.url === "string") {
        const atts = Array.isArray(entry.attachments)
          ? entry.attachments.filter((u): u is string => typeof u === "string")
          : undefined;
        return [
          {
            url: entry.url,
            streaming: !!entry.streaming,
            ...(atts && atts.length ? { attachments: atts } : {}),
          },
        ];
      }
      return [];
    });
  } catch {
    return [];
  }
}

export function addRemote(
  url: string,
  streaming = false,
  attachments: string[] = [],
): void {
  const list = getRemotes();
  if (!list.some((e) => e.url === url)) {
    const entry: RemoteEntry = {
      url,
      streaming,
      ...(attachments.length ? { attachments } : {}),
    };
    try {
      localStorage.setItem(REMOTES_KEY, JSON.stringify([...list, entry]));
    } catch {
      /* storage unavailable — remote just won't persist */
    }
  }
}

export function removeRemote(url: string): void {
  try {
    localStorage.setItem(
      REMOTES_KEY,
      JSON.stringify(getRemotes().filter((e) => e.url !== url)),
    );
  } catch {
    /* ignore */
  }
}
