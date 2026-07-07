// Persistence for user-added docsets, in IndexedDB (docset bytes can be large).
// All calls are best-effort: if IndexedDB is unavailable they resolve to no-ops
// so the bundled docsets still work.

const DB_NAME = "khb";
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
