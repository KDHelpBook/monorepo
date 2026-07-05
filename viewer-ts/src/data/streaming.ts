// @ts-nocheck — the vendored wa-sqlite JS ships no `.d.ts`; this module is
// verified against a live docset over HTTP Range instead (see docs/streaming.md).
//
// Browser page-level streaming engine (wa-sqlite + async Range VFS).
//
// This is the browser counterpart of `compiler/core/src/vfs.rs`: a read-only
// SQLite VFS that turns each "give me page N" into an HTTP `Range:` request, so
// a query downloads only the pages it touches instead of the whole `.khb`. On a
// 618 KB demo docset, opening + reading one page by primary key fetches ~21 % of
// the file (64 KiB blocks) — the same win the native VFS shows on a 2 MB file.
//
// Engine: a **custom wa-sqlite 1.1.1 Asyncify build WITH FTS5** (SQLite 3.53
// `--enable-all`), vendored under `viewer-ts/vendor/wa-sqlite/`. Unlike stock
// sql.js (and the prebuilt wa-sqlite), this restores real in-browser FTS5 —
// bm25-ranked `MATCH` over the streamed index. The Asyncify build lets a VFS
// method `await` a `fetch()`, which is what makes streaming from JS possible.
//
// wa-sqlite 1.1's VFS authoring model: extend `FacadeVFS` and implement the
// JS-friendly `jOpen/jRead/…` methods; any declared `async` one is detected and
// suspended/resumed through Asyncify automatically (no `handleAsync` wrapper).

import { FacadeVFS } from "../../vendor/wa-sqlite/src/FacadeVFS.js";
import * as VFS from "../../vendor/wa-sqlite/src/VFS.js";
import * as SQLite from "../../vendor/wa-sqlite/src/sqlite-api.js";
import SQLiteAsyncFactory from "../../vendor/wa-sqlite/dist/wa-sqlite-async.mjs";
import wasmUrl from "../../vendor/wa-sqlite/dist/wa-sqlite-async.wasm?url";

const DEFAULT_BLOCK = 65536; // coalesce reads into 64 KiB cached blocks, like vfs.rs

/** A read-only SQLite VFS that reads a single remote file over HTTP Range. */
export class RangeVFS extends FacadeVFS {
  url: string;
  block_size: number;
  size = 0;
  cache = new Map<number, Uint8Array>(); // blockIndex -> bytes
  bytesRead = 0; // instrumentation: total bytes fetched over the wire

  static async create(
    name: string,
    module: unknown,
    url: string,
    blockSize = DEFAULT_BLOCK,
  ): Promise<RangeVFS> {
    const vfs = new RangeVFS(name, module, url, blockSize);
    await vfs.isReady();
    return vfs;
  }

  constructor(
    name: string,
    module: unknown,
    url: string,
    blockSize: number,
  ) {
    super(name, module);
    this.url = url;
    this.block_size = blockSize;
  }

  /** Total file size (known after the first open). */
  get fileSize(): number {
    return this.size;
  }

  getFilename(): string {
    return this.url;
  }

  /** Probe the file size once, up front (via a 1-byte Range GET). */
  private async probe(): Promise<number> {
    const res = await fetch(this.url, { headers: { Range: "bytes=0-0" } });
    if (res.status !== 206) {
      throw new Error(
        `range not honoured (status ${res.status}); host must return 206`,
      );
    }
    const cr = res.headers.get("Content-Range"); // "bytes 0-0/618496"
    const total = cr && cr.split("/")[1];
    if (!total) throw new Error("no Content-Range total in probe response");
    await res.arrayBuffer(); // drain
    this.bytesRead += 1;
    return Number(total);
  }

  /** Fetch (and cache) the block containing `offset`. */
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

  // --- VFS methods (jXxx). Async ones await fetch(); Asyncify suspends SQLite.

  async jOpen(
    _filename: string | null,
    _pFile: number,
    flags: number,
    pOutFlags: DataView,
  ): Promise<number> {
    // Single-file VFS: the URL is fixed at construction, so the name is ignored.
    this.size = await this.probe();
    pOutFlags.setInt32(0, flags, true);
    return VFS.SQLITE_OK;
  }

  async jRead(
    _pFile: number,
    pData: Uint8Array,
    iOffset: number,
  ): Promise<number> {
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
  }

  // Read-only, immutable: writes/truncate rejected; the file has no journal/WAL.
  jWrite(): number {
    return VFS.SQLITE_READONLY;
  }
  jTruncate(): number {
    return VFS.SQLITE_READONLY;
  }

  jFileSize(_pFile: number, pSize64: DataView): number {
    pSize64.setBigInt64(0, BigInt(this.size), true);
    return VFS.SQLITE_OK;
  }

  jCheckReservedLock(_pFile: number, pResOut: DataView): number {
    pResOut.setInt32(0, 0, true);
    return VFS.SQLITE_OK;
  }

  jSectorSize(): number {
    return 4096;
  }

  jDeviceCharacteristics(): number {
    return VFS.SQLITE_IOCAP_IMMUTABLE;
  }

  jAccess(_filename: string, _flags: number, pResOut: DataView): number {
    // Nothing beside the main file exists (immutable DB → no journal/WAL).
    pResOut.setInt32(0, 0, true);
    return VFS.SQLITE_OK;
  }
}

let apiPromise: Promise<{ module: any; sqlite3: any }> | null = null;
let vfsSeq = 0; // unique VFS name per open (wa-sqlite rejects duplicates)

/**
 * Build (once) the wa-sqlite async Emscripten module + its high-level API. The
 * module AND `SQLite.Factory(module)` must each be created exactly once — calling
 * Factory twice on the same module corrupts the wasm heap — so both are cached
 * and shared across every streamed docset (each opens its own VFS + connection).
 */
async function sqliteApi(): Promise<{ module: any; sqlite3: any }> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const module = await SQLiteAsyncFactory({ locateFile: () => wasmUrl });
      return { module, sqlite3: SQLite.Factory(module) };
    })();
  }
  return apiPromise;
}

type SqlParams = (string | number | null)[];

/**
 * A remote `.khb` opened over the Range VFS: an async query surface (`all` /
 * `one`) mirroring the sql.js helpers in `docset.ts`, so the same SQL runs on
 * either engine. Only touched pages are fetched; `bytesRead` tracks the total.
 */
export class StreamingDb {
  private constructor(
    private readonly sqlite3: any,
    private readonly db: number,
    private readonly vfs: RangeVFS,
  ) {}

  static async open(
    url: string,
    blockSize = DEFAULT_BLOCK,
  ): Promise<StreamingDb> {
    const { module, sqlite3 } = await sqliteApi();
    const vfsName = `kdhelp-range-${vfsSeq++}`;
    const vfs = await RangeVFS.create(vfsName, module, url, blockSize);
    sqlite3.vfs_register(vfs, false);
    const db = await sqlite3.open_v2(
      url,
      SQLite.SQLITE_OPEN_READONLY,
      vfsName,
    );
    return new StreamingDb(sqlite3, db, vfs);
  }

  get bytesRead(): number {
    return this.vfs.bytesRead;
  }
  get fileSize(): number {
    return this.vfs.fileSize;
  }

  /** Run `sql` (optionally bound) and return every row as a `{col: value}`. */
  async all(
    sql: string,
    params: SqlParams = [],
  ): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    for await (const stmt of this.sqlite3.statements(this.db, sql)) {
      if (params.length) this.sqlite3.bind_collection(stmt, params);
      const cols: string[] = this.sqlite3.column_names(stmt);
      while ((await this.sqlite3.step(stmt)) === SQLite.SQLITE_ROW) {
        const values: unknown[] = this.sqlite3.row(stmt);
        const row: Record<string, unknown> = {};
        cols.forEach((c, i) => (row[c] = values[i]));
        out.push(row);
      }
    }
    return out;
  }

  /** First column of the first row (or null). */
  async one(sql: string, params: SqlParams = []): Promise<unknown> {
    const rows = await this.all(sql, params);
    if (!rows.length) return null;
    const first = rows[0];
    const key = Object.keys(first)[0];
    return key === undefined ? null : first[key];
  }

  close(): void {
    try {
      this.sqlite3.close(this.db);
    } catch {
      /* already closed */
    }
  }
}

export interface StreamProbeResult {
  docsetId: string | null;
  title: string | null;
  pageCount: number;
  hasFts5: boolean;
  ftsError: string | null;
  ftsHits: { id: string; title: string }[]; // real bm25-ranked FTS5 results
  firstPageId: string | null;
  fileSize: number;
  openBytes: number; // bytes fetched to open + read schema
  metaBytes: number; // extra bytes to read a couple of meta rows (PK lookups)
  onePageBytes: number; // extra bytes to load one full page body by PK
  ftsBytes: number; // extra bytes an FTS5 MATCH streamed
  totalBytes: number;
}

/**
 * Open a remote `.khb` via the Range VFS, read metadata + one page by primary
 * key, run a real FTS5 `MATCH`, and report how many bytes were actually fetched
 * at each step. A live proof that browser page-level streaming + real FTS5 work
 * end to end. `blockSize` tunes read coalescing (64 KiB default; 4 KiB = one
 * SQLite page, for a fine-grained demo).
 */
export async function streamProbe(
  url: string,
  blockSize = DEFAULT_BLOCK,
  ftsQuery = "lorem",
): Promise<StreamProbeResult> {
  const sdb = await StreamingDb.open(url, blockSize);
  const one = (sql: string): Promise<unknown> => sdb.one(sql);

  // Opening + a trivial statement forces the schema (header + sqlite_master).
  await one("SELECT 1");
  const openBytes = sdb.bytesRead;

  // Point lookups on the `meta` PRIMARY KEY — index reads, not full scans.
  const docsetId = await one("SELECT value FROM meta WHERE key='docset_id'");
  const title = await one("SELECT value FROM meta WHERE key='title'");
  const metaBytes = sdb.bytesRead - openBytes;

  const pageCount = Number(await one("SELECT count(*) FROM pages"));

  // Load exactly ONE page body by PRIMARY KEY — the core streaming win.
  const before = sdb.bytesRead;
  const firstPageId = await one("SELECT id FROM pages ORDER BY id LIMIT 1");
  if (firstPageId !== null) {
    await sdb.one("SELECT body_html FROM pages WHERE id = ?", [
      String(firstPageId),
    ]);
  }
  const onePageBytes = sdb.bytesRead - before;

  // The payoff: a genuine FTS5 MATCH (bm25-ranked), streaming only FTS pages.
  const beforeFts = sdb.bytesRead;
  let hasFts5 = true;
  let ftsError: string | null = null;
  let ftsHits: { id: string; title: string }[] = [];
  try {
    const r = await sdb.all(
      `SELECT p.id AS id, p.title AS title FROM pages_fts f
       JOIN pages p ON p.rowid = f.rowid
       WHERE pages_fts MATCH ?
       ORDER BY bm25(pages_fts) LIMIT 5`,
      [ftsQuery],
    );
    ftsHits = r.map((row) => ({
      id: String(row.id),
      title: String(row.title),
    }));
  } catch (e) {
    hasFts5 = false;
    ftsError = e instanceof Error ? e.message : String(e);
  }
  const ftsBytes = sdb.bytesRead - beforeFts;

  const totalBytes = sdb.bytesRead;
  const fileSize = sdb.fileSize;
  sdb.close();

  return {
    docsetId: docsetId === null ? null : String(docsetId),
    title: title === null ? null : String(title),
    pageCount,
    hasFts5,
    ftsError,
    ftsHits,
    firstPageId: firstPageId === null ? null : String(firstPageId),
    fileSize,
    openBytes,
    metaBytes,
    onePageBytes,
    ftsBytes,
    totalBytes,
  };
}
