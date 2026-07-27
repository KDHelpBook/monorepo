// Persistence for user-added docsets, in IndexedDB (docset bytes can be large).
// All calls are best-effort: if IndexedDB is unavailable they resolve to no-ops
// so the bundled docsets still work.

const DB_NAME = "khb";
const STORE = "docsets";
/** Prefetch cache: whole `.khb` (and pack) bytes for bundled/remote streamed
 *  books, so a streamed book can be used offline / from cache on later loads. */
const BLOBS = "blobs";
const VERSION = 2;

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

/** A prefetched whole `.khb` (+ its packs), keyed by URL + content hash so a new
 *  build (new hash) misses and re-prefetches. */
export interface StoredBlob {
  key: string;
  bytes: Uint8Array;
  packs: Uint8Array[];
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
      if (!db.objectStoreNames.contains(BLOBS)) {
        db.createObjectStore(BLOBS, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const req = fn(tx.objectStore(storeName));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return undefined;
  }
}

export async function putDocset(d: StoredDocset): Promise<void> {
  await withStore(STORE, "readwrite", (s) => s.put(d));
}

export async function deleteDocset(id: string): Promise<void> {
  await withStore(STORE, "readwrite", (s) => s.delete(id));
}

export async function allDocsets(): Promise<StoredDocset[]> {
  return (
    (await withStore<StoredDocset[]>(STORE, "readonly", (s) => s.getAll())) ?? []
  );
}

/** The prefetch-cache key for a docset URL at a given content hash. */
export function blobKey(url: string, hash: string): string {
  return `${url}@${hash}`;
}

/** Read a prefetched whole `.khb` (+ packs) by key, or null if not cached. */
export async function getBlob(key: string): Promise<StoredBlob | null> {
  return (
    (await withStore<StoredBlob>(BLOBS, "readonly", (s) => s.get(key))) ?? null
  );
}

/** Cache a prefetched whole `.khb` (+ packs). Best-effort: a quota failure is a
 *  no-op (the book keeps streaming). */
export async function putBlob(blob: StoredBlob): Promise<void> {
  await withStore(BLOBS, "readwrite", (s) => s.put(blob));
}

/** Every cached blob key — for pruning entries whose content hash is now stale. */
export async function allBlobKeys(): Promise<string[]> {
  const keys = await withStore<IDBValidKey[]>(BLOBS, "readonly", (s) =>
    s.getAllKeys(),
  );
  return (keys ?? []).map(String);
}

/** Drop cached blobs whose key isn't in `keep` (superseded builds / removed books). */
export async function pruneBlobs(keep: Set<string>): Promise<void> {
  for (const key of await allBlobKeys()) {
    if (!keep.has(key)) await withStore(BLOBS, "readwrite", (s) => s.delete(key));
  }
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
const REMOTES_KEY = "khb.remotes";

export interface RemoteEntry {
  url: string;
  streaming?: boolean;
  /** Sidecar `.khba` pack URLs. Streamed for a `streaming` remote, else fetched
   *  whole — so a whole-file `.khb` can pair with remote packs too. */
  attachments?: string[];
  /** The `.khbm` this entry was imported from, if any (for grouping/removal). */
  manifest?: string;
}

export function getRemotes(): RemoteEntry[] {
  try {
    const raw = localStorage.getItem(REMOTES_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    return list.flatMap((e): RemoteEntry[] => {
      // `streaming` is now a *preference*: default true (prefer streaming, fall back
      // to a whole fetch if the host has no Range support); only an explicit `false`
      // forces a full download. Bare-string legacy entries default to the preference.
      if (typeof e === "string") return [{ url: e, streaming: true }];
      const entry = e as RemoteEntry;
      if (e && typeof entry.url === "string") {
        const atts = Array.isArray(entry.attachments)
          ? entry.attachments.filter((u): u is string => typeof u === "string")
          : undefined;
        return [
          {
            url: entry.url,
            streaming: entry.streaming !== false,
            ...(atts && atts.length ? { attachments: atts } : {}),
            ...(typeof entry.manifest === "string"
              ? { manifest: entry.manifest }
              : {}),
          },
        ];
      }
      return [];
    });
  } catch {
    return [];
  }
}

/** Add (or update) a remote docset. Returns true if it was newly added. */
export function addRemote(
  url: string,
  streaming = false,
  attachments: string[] = [],
  manifest?: string,
): boolean {
  const list = getRemotes();
  if (list.some((e) => e.url === url)) return false;
  const entry: RemoteEntry = {
    url,
    streaming,
    ...(attachments.length ? { attachments } : {}),
    ...(manifest ? { manifest } : {}),
  };
  try {
    localStorage.setItem(REMOTES_KEY, JSON.stringify([...list, entry]));
  } catch {
    /* storage unavailable — remote just won't persist */
  }
  return true;
}

/** Fetch and import a `.khbm` manifest, adding each docset as a remote. Returns the
 *  manifest title (if any) and how many entries were newly added. */
export async function importKhbm(
  url: string,
): Promise<{ title?: string; added: number; total: number }> {
  const { parseKhbm } = await import("./khbm");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const manifest = parseKhbm(await res.text(), url);
  let added = 0;
  for (const d of manifest.docsets) {
    // Prefer streaming (auto-falls back to a whole fetch when Range isn't available).
    if (addRemote(d.url, true, d.attachments, url)) added++;
  }
  return {
    ...(manifest.title != null ? { title: manifest.title } : {}),
    added,
    total: manifest.docsets.length,
  };
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

// Extra `.khba` pack URLs the reader attached to a docset to supply its missing
// assets (the pack `asset_index` routes to but that wasn't shipped). Keyed by
// docset id, applied on load alongside the docset's own packs. localStorage.
const EXTRA_PACKS_KEY = "khb.extraPacks";

export function loadExtraPacks(): Record<string, string[]> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(EXTRA_PACKS_KEY) ?? "{}");
    if (!v || typeof v !== "object") return {};
    const out: Record<string, string[]> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (Array.isArray(val)) {
        out[k] = val.filter((x): x is string => typeof x === "string");
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function addExtraPack(docsetId: string, url: string): void {
  const map = loadExtraPacks();
  const list = map[docsetId] ?? [];
  if (!list.includes(url)) map[docsetId] = [...list, url];
  try {
    localStorage.setItem(EXTRA_PACKS_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — the attached pack just won't persist */
  }
}
