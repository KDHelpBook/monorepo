// @ts-nocheck — wa-sqlite@1.0.0 ships a `.d.ts` that disagrees with its own
// async-build runtime (e.g. it types VFS `pData` as `{size, value}`, but the
// Asyncify glue and the bundled JS examples both pass a plain `Uint8Array`), so
// this file can't typecheck against those declarations. Behaviour is verified
// against a live docset over HTTP Range instead (see docs/streaming.md).
//
// Browser page-level streaming engine (wa-sqlite + async Range VFS).
//
// This is the browser counterpart of `compiler/core/src/vfs.rs`: a read-only
// SQLite VFS that turns each "give me page N" into an HTTP `Range:` request, so
// a query downloads only the pages it touches instead of the whole `.khb`. On a
// 139 KB demo docset, opening + reading one page by primary key fetches ~18 % of
// the file — the same win the native VFS shows on a 2 MB file (~15 %).
//
// The async build (Asyncify) lets VFS methods `await` a `fetch()` — that is the
// whole reason we can stream from JavaScript. Methods that may do I/O are
// wrapped in `this.handleAsync(async () => …)`, which the async build rewires to
// a real suspend/resume on registration.
//
// NOTE: the *prebuilt* wa-sqlite dist has **no FTS5** (`hasFts5` is false here);
// restoring real in-browser FTS5 needs a custom Emscripten build. Until then the
// viewer keeps searching the stored `plain` column (see docs/streaming.md). This
// module proves the hard part — the async Range VFS — and is the seam a future
// async data layer would open a streamed book through. It is deliberately not
// yet wired into the (synchronous) sql.js `Collection`; see docs/streaming.md
// step 3 for why that trade waits.

import * as VFS from "wa-sqlite/src/VFS.js";
import * as SQLite from "wa-sqlite";
// The Asyncify factory + its wasm (Vite resolves `?url` to an asset path).
import SQLiteAsyncFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import wasmUrl from "wa-sqlite/dist/wa-sqlite-async.wasm?url";

const DEFAULT_BLOCK = 65536; // coalesce reads into 64 KiB cached blocks, like vfs.rs

/** A read-only SQLite VFS that reads a single remote file over HTTP Range. */
export class RangeVFS extends VFS.Base {
  name: string;
  private url: string;
  private block_size: number;
  private size = 0;
  private cache = new Map<number, Uint8Array>(); // blockIndex -> bytes
  bytesRead = 0; // instrumentation: total bytes fetched over the wire

  constructor(name: string, url: string, blockSize = DEFAULT_BLOCK) {
    super();
    this.name = name;
    this.url = url;
    this.block_size = blockSize;
  }

  /** Total file size (known after the first open). */
  get fileSize(): number {
    return this.size;
  }

  /** Probe the file size once, up front (HEAD-like, via a 1-byte Range GET). */
  private async probe(): Promise<number> {
    const res = await fetch(this.url, { headers: { Range: "bytes=0-0" } });
    if (res.status !== 206) {
      throw new Error(
        `range not honoured (status ${res.status}); host must return 206`,
      );
    }
    const cr = res.headers.get("Content-Range"); // "bytes 0-0/139264"
    const total = cr && cr.split("/")[1];
    if (!total) throw new Error("no Content-Range total in probe response");
    await res.arrayBuffer(); // drain
    this.bytesRead += 1;
    return Number(total);
  }

  /** Fetch (and cache) the 64 KiB block containing `offset`. */
  private async block(index: number): Promise<Uint8Array> {
    const cached = this.cache.get(index);
    if (cached) return cached;
    const start = index * this.block_size;
    const end = Math.min(start + this.block_size, this.size) - 1;
    const res = await fetch(this.url, {
      headers: { Range: `bytes=${start}-${end}` },
    });
    if (res.status !== 206) throw new Error(`range read failed (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    this.bytesRead += bytes.byteLength;
    this.cache.set(index, bytes);
    return bytes;
  }

  xOpen(
    name: string | null,
    fileId: number,
    flags: number,
    pOutFlags: DataView,
  ): number {
    return this.handleAsync(async () => {
      // Single-file VFS: `name` is ignored — the URL is fixed at construction.
      this.size = await this.probe();
      pOutFlags.setInt32(0, flags, true);
      return VFS.SQLITE_OK;
    });
  }

  xClose(): number {
    return VFS.SQLITE_OK;
  }

  xRead(fileId: number, pData: Uint8Array, iOffset: number): number {
    return this.handleAsync(async () => {
      let filled = 0;
      while (filled < pData.byteLength) {
        const pos = iOffset + filled;
        if (pos >= this.size) break;
        const index = Math.floor(pos / this.block_size);
        const block = await this.block(index);
        const within = pos - index * this.block_size;
        const n = Math.min(block.byteLength - within, pData.byteLength - filled);
        pData.set(block.subarray(within, within + n), filled);
        filled += n;
      }
      if (filled < pData.byteLength) {
        pData.fill(0, filled); // zero the tail
        return VFS.SQLITE_IOERR_SHORT_READ;
      }
      return VFS.SQLITE_OK;
    });
  }

  // Read-only, immutable: writes/locks/sync are no-ops; no journal or WAL.
  xWrite(): number {
    return VFS.SQLITE_READONLY;
  }
  xTruncate(): number {
    return VFS.SQLITE_READONLY;
  }
  xSync(): number {
    return VFS.SQLITE_OK;
  }

  xFileSize(fileId: number, pSize64: DataView): number {
    pSize64.setBigInt64(0, BigInt(this.size), true);
    return VFS.SQLITE_OK;
  }

  xLock(): number {
    return VFS.SQLITE_OK;
  }
  xUnlock(): number {
    return VFS.SQLITE_OK;
  }
  xCheckReservedLock(fileId: number, pResOut: DataView): number {
    pResOut.setInt32(0, 0, true);
    return VFS.SQLITE_OK;
  }
  xFileControl(): number {
    return VFS.SQLITE_NOTFOUND;
  }
  xSectorSize(): number {
    return 4096;
  }
  xDeviceCharacteristics(): number {
    return VFS.SQLITE_IOCAP_IMMUTABLE;
  }

  xAccess(name: string, flags: number, pResOut: DataView): number {
    // Nothing beside the main file exists (no journal/WAL for immutable DB).
    pResOut.setInt32(0, 0, true);
    return VFS.SQLITE_OK;
  }
  xDelete(): number {
    return VFS.SQLITE_OK;
  }
}

let factoryPromise: Promise<any> | null = null;
let vfsSeq = 0; // unique VFS name per open (wa-sqlite rejects duplicates)

/** Build (once) the wa-sqlite async API bound to the Asyncify wasm module. */
async function sqliteApi(): Promise<any> {
  if (!factoryPromise) {
    factoryPromise = (async () => {
      const module = await SQLiteAsyncFactory({ locateFile: () => wasmUrl });
      return SQLite.Factory(module);
    })();
  }
  return factoryPromise;
}

export interface SpikeResult {
  docsetId: string | null;
  title: string | null;
  pageCount: number;
  hasFts5: boolean;
  firstPageId: string | null;
  fileSize: number;
  openBytes: number; // bytes fetched to open + read schema
  metaBytes: number; // extra bytes to read a couple of meta rows (PK lookups)
  onePageBytes: number; // extra bytes to load one full page body by PK
  totalBytes: number;
}

/**
 * Open a remote `.khb` via the Range VFS, read metadata + one page by primary
 * key, and report how many bytes were actually fetched (open / meta / one page).
 * A live proof that browser page-level streaming works end to end, and the
 * measurement behind the "~18 % to open + read a page" figure. `blockSize`
 * tunes read coalescing (64 KiB default for real remote files; 4 KiB = one
 * SQLite page, for a fine-grained demo).
 */
export async function streamProbe(
  url: string,
  blockSize = DEFAULT_BLOCK,
): Promise<SpikeResult> {
  const sqlite3 = await sqliteApi();
  const vfsName = `kdhelp-range-${vfsSeq++}`;
  const vfs = new RangeVFS(vfsName, url, blockSize);
  sqlite3.vfs_register(vfs, false);

  const one = async (db: number, sql: string): Promise<any> => {
    let value: any = null;
    for await (const stmt of sqlite3.statements(db, sql)) {
      if ((await sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
        value = sqlite3.column(stmt, 0);
      }
    }
    return value;
  };

  // Opening the DB reads the header + sqlite_master (schema) pages only.
  const db = await sqlite3.open_v2(
    "kdhelp",
    SQLite.SQLITE_OPEN_READONLY,
    vfsName,
  );
  // Force schema parse with a trivial prepared statement, then snapshot.
  await one(db, "SELECT 1");
  const openBytes = vfs.bytesRead;

  // Point lookups on the `meta` PRIMARY KEY — index reads, not full scans.
  const docsetId = await one(
    db,
    "SELECT value FROM meta WHERE key='docset_id'",
  );
  const title = await one(db, "SELECT value FROM meta WHERE key='title'");
  const metaBytes = vfs.bytesRead - openBytes;

  // How many pages exist, and does this build have FTS5?
  const pageCount = Number(await one(db, "SELECT count(*) FROM pages"));
  const hasFts5 = await (async () => {
    try {
      await one(db, "SELECT count(*) FROM pages_fts LIMIT 1");
      return true;
    } catch {
      return false;
    }
  })();

  // Load exactly ONE page body by PRIMARY KEY — the core streaming win: this
  // touches only that row's pages (+ overflow), not the whole file.
  const before = vfs.bytesRead;
  const firstPageId = await one(
    db,
    "SELECT id FROM pages ORDER BY id LIMIT 1",
  );
  if (firstPageId !== null) {
    await one(
      db,
      `SELECT body_html FROM pages WHERE id='${String(firstPageId).replace(/'/g, "''")}'`,
    );
  }
  const onePageBytes = vfs.bytesRead - before;

  await sqlite3.close(db);

  return {
    docsetId: docsetId === null ? null : String(docsetId),
    title: title === null ? null : String(title),
    pageCount,
    hasFts5,
    firstPageId: firstPageId === null ? null : String(firstPageId),
    fileSize: vfs.fileSize,
    openBytes,
    metaBytes,
    onePageBytes,
    totalBytes: vfs.bytesRead,
  };
}
