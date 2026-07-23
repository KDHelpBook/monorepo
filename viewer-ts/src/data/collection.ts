import {
  type AssetBlob,
  type Category,
  type IDocset,
  type KeywordEntry,
  type Page,
  type SearchHit,
  type TocNode,
} from "./docset";
const SEP = ":";

/** A sidecar `.khba` attachment pack: in-memory bytes or a URL (`.gz` = gzip'd). */
export type AttachmentSource = { bytes: Uint8Array } | { file: string };

/**
 * A docset to load (all served by the one wa-sqlite engine, real FTS5):
 * - `{ bytes }` — already-in-memory (upload / IndexedDB), read whole from memory;
 * - `{ file }` — a URL fetched **whole** (a `.gz` suffix is decompressed);
 * - `{ url, mode: "streaming" }` — a remote `.khb` opened **page-by-page** over
 *   HTTP `Range`, never fetched whole.
 * The first two may carry `.khba` attachment packs.
 */
export type DocsetSource =
  | (({ bytes: Uint8Array } | { file: string }) & {
      attachments?: AttachmentSource[];
    })
  | { url: string; mode: "streaming"; attachments?: string[] };

/** Decompress gzip bytes via the native DecompressionStream. */
async function gunzip(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Fetch a docset/pack URL and decompress it if the payload is gzip. We sniff the
 * gzip magic (`1f 8b`) rather than trusting the `.gz` suffix: some static servers
 * (Vite's dev server included) auto-apply `Content-Encoding: gzip` for `.gz` names,
 * so the browser has already decompressed the body — while a plain host (e.g. GitHub
 * Pages) serves the `.gz` bytes verbatim. The magic works in both cases.
 */
/** A streaming source is opened page-by-page over Range, not fetched whole. */
type StreamingSource = { url: string; mode: "streaming" };
function isStreaming(s: DocsetSource): s is StreamingSource {
  return "mode" in s && s.mode === "streaming";
}

/**
 * Report download progress: `loaded` bytes received so far, `total` from the
 * `Content-Length` header (null when the server omits it — chunked/compressed).
 * For a gzip'd docset the counts are the *compressed* size, so the percentage is
 * against the transferred bytes — still a monotonic 0→100 %.
 */
export type DownloadProgress = (loaded: number, total: number | null) => void;

/**
 * Collection-load progress: the current whole-file download's byte counts, plus
 * which source it is (`index`) and how many sources load in all (`count`) — so a
 * UI can name the book and show `(2/3)`. Streaming sources report nothing.
 */
export type LoadProgress = (
  loaded: number,
  total: number | null,
  index: number,
  count: number,
) => void;

/** Coarse classification of why a docset failed to load, for a clear UI message. */
export type LoadErrorKind =
  | "web-page" // the server returned an HTML page (missing file / SPA fallback)
  | "not-a-khb" // fetched, but the bytes aren't a valid `.khb`
  | "http" // an HTTP error status (404, 500, …)
  | "network" // the request never completed (offline, DNS, CORS)
  | "unknown"; // anything else — show the raw message

/** A load failure tied to one docset source, classified and carrying its origin. */
export class DocsetLoadError extends Error {
  constructor(
    /** The URL (or a label) of the source that failed. */
    readonly source: string,
    readonly kind: LoadErrorKind,
    /** The underlying message — shown verbatim when `kind` is "unknown". */
    readonly detail: string,
    /** The book's display title, when known (from the caller's labels). */
    readonly title?: string,
  ) {
    super(`${kind}: ${detail} (${title ? `${title}, ` : ""}${source})`);
    this.name = "DocsetLoadError";
  }
}

/** Map a raw thrown value to a {@link LoadErrorKind} + its message. Exported for tests. */
export function classifyLoadError(cause: unknown): {
  kind: LoadErrorKind;
  detail: string;
} {
  const detail = cause instanceof Error ? cause.message : String(cause);
  if (/HTML page/i.test(detail)) return { kind: "web-page", detail };
  if (/not a database|malformed|not a valid|encrypted|file is not/i.test(detail))
    return { kind: "not-a-khb", detail };
  if (/^HTTP \d{3}\b|\b[45]\d\d\b/.test(detail)) return { kind: "http", detail };
  if (/failed to fetch|networkerror|load failed|ERR_|CORS/i.test(detail))
    return { kind: "network", detail };
  return { kind: "unknown", detail };
}

/** A short identifier for a source, for the error message. */
function sourceLabel(src: DocsetSource): string {
  if ("url" in src) return src.url;
  if ("file" in src) return src.file;
  return "an uploaded file";
}

/**
 * Turn fetched bytes into a docset: gunzip if gzip-magic, else return as-is —
 * but first catch the common "static host answered a missing file with a 200
 * HTML page" case (a 404 page or an SPA fallback). Those bytes start with `<`
 * and would otherwise fail deep in SQLite as the opaque "file is not a
 * database"; flag them clearly so the caller can classify the failure.
 */
async function finalizeDocsetBytes(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return gunzip(bytes);
  if (bytes[0] === 0x3c) throw new Error("received an HTML page, not a .khb");
  return bytes;
}

export async function fetchDocsetBytes(
  url: string,
  onProgress?: DownloadProgress,
): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  // With a progress callback, stream the body so we can count bytes as they
  // arrive; without one (or without a readable body), the one-shot buffer is fine.
  if (onProgress && res.body) {
    const header = res.headers.get("Content-Length");
    const total = header ? Number(header) : null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      // A server may under-report Content-Length vs the real body; never show >total.
      onProgress(loaded, total != null && total >= loaded ? total : null);
    }
    const bytes = new Uint8Array(loaded);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.length;
    }
    return finalizeDocsetBytes(bytes);
  }
  return finalizeDocsetBytes(new Uint8Array(await res.arrayBuffer()));
}

/**
 * Cheaply probe whether a host honours HTTP `Range` (needed for page-level
 * streaming): a 1-byte request returns **206 Partial Content** if it does. Used to
 * decide streaming-vs-whole for a remote without loading the streaming engine — if
 * Range isn't supported (or CORS blocks the header), we fetch the docset whole.
 */
export async function rangeSupported(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-0" } });
    const ok = res.status === 206;
    // Stop the body download (a server that ignored Range sent the whole file).
    await res.body?.cancel().catch(() => undefined);
    return ok;
  } catch {
    return false;
  }
}

/**
 * A merged view over several `.khb` docsets — the MS Help 2 "collection": one
 * table of contents, one index, one search across many books. Page ids are
 * namespaced as `docsetId:localId` so books never collide.
 */
export class Collection {
  private constructor(
    readonly language: string,
    private readonly docsets: IDocset[],
  ) {}

  /** Build a collection from already-open docsets (native Tauri path / tests). */
  static of(docsets: IDocset[], language: string): Collection {
    return new Collection(language, docsets);
  }

  /** Close every docset (frees its wa-sqlite handle) — used before a live swap
   *  when the loaded set changes (version/language switch). */
  close(): void {
    for (const d of this.docsets) d.close();
  }

  static async load(
    sources: DocsetSource[],
    language: string,
    opts: {
      /** Whole-file download progress. */
      onProgress?: LoadProgress;
      /** Book titles, index-aligned with `sources`, to name a failed source. */
      labels?: string[];
      /** Called per failed source, with its index into `sources` (so the caller
       *  can map it back to the chosen edition). A **bad book is skipped, not
       *  fatal**: the others still load, and the caller decides how to surface the
       *  failure. With no handler, a failure throws (legacy all-or-nothing). */
      onError?: (err: DocsetLoadError, index: number) => void;
    } = {},
  ): Promise<Collection> {
    const { onProgress, labels, onError } = opts;
    const docsets: IDocset[] = [];
    const count = sources.length;
    // One wa-sqlite engine backs every book — streamed over Range or whole-file from
    // memory. Code-split so it loads once, on first docset open, not in the app shell.
    const { StreamingDocset } = await import("./streaming-docset");
    for (let index = 0; index < sources.length; index++) {
      const src = sources[index]!;
      try {
        if (isStreaming(src)) {
          docsets.push(
            await StreamingDocset.open(src.url, src.attachments ?? []),
          );
          continue;
        }
        // Only a whole-file fetch has bytes to count; in-memory sources are instant.
        const report: DownloadProgress | undefined = onProgress
          ? (loaded, total) => onProgress(loaded, total, index, count)
          : undefined;
        const bytes =
          "bytes" in src ? src.bytes : await fetchDocsetBytes(src.file, report);
        const attachmentBytes: Uint8Array[] = [];
        for (const a of src.attachments ?? []) {
          attachmentBytes.push(
            "bytes" in a ? a.bytes : await fetchDocsetBytes(a.file),
          );
        }
        docsets.push(await StreamingDocset.openBytes(bytes, attachmentBytes));
      } catch (cause) {
        // Classify + tag with the source (and title) so the UI can explain which
        // book failed and why, instead of a raw SQLite/fetch message.
        const { kind, detail } = classifyLoadError(cause);
        const err = new DocsetLoadError(
          sourceLabel(src),
          kind,
          detail,
          labels?.[index],
        );
        // Skip a bad book and keep loading the rest when the caller handles errors.
        if (onError) onError(err, index);
        else throw err;
      }
    }
    return new Collection(language, docsets);
  }

  /** Resolve an attachment (`asset:<path>`) referenced by a page in `fromNsId`. */
  async asset(fromNsId: string, path: string): Promise<AssetBlob | null> {
    return (
      (await this.find(this.split(fromNsId).docsetId)?.asset(path)) ?? null
    );
  }

  /** Split a namespaced id into its docset id and the local page id. */
  split(nsId: string): { docsetId: string; localId: string } {
    const i = nsId.indexOf(SEP);
    return i === -1
      ? { docsetId: "", localId: nsId }
      : { docsetId: nsId.slice(0, i), localId: nsId.slice(i + 1) };
  }

  /** Resolve an in-content `#localId` link relative to the docset of `fromNsId`. */
  resolveLink(fromNsId: string, localId: string): string {
    const { docsetId } = this.split(fromNsId);
    return this.ns(docsetId, localId);
  }

  /** The display title of the book a page belongs to. */
  docsetTitle(nsId: string): string {
    return this.find(this.split(nsId).docsetId)?.title ?? "";
  }

  /** The books (docsets) in this collection, for scope filters + version display. */
  books(): {
    id: string;
    title: string;
    version: string;
    language: string;
    collection: string;
  }[] {
    return this.docsets.map((d) => ({
      id: d.id,
      title: d.title,
      version: d.version,
      language: d.language,
      collection: d.collection,
    }));
  }

  /**
   * The product families in this collection — docsets grouped by `collection`, in
   * load order. Books sharing a family merge; different families are separate.
   */
  families(): { id: string; title: string; docsetIds: string[] }[] {
    const byId = new Map<
      string,
      { id: string; title: string; docsetIds: string[] }
    >();
    const order: string[] = [];
    for (const d of this.docsets) {
      let fam = byId.get(d.collection);
      if (!fam) {
        fam = { id: d.collection, title: d.collectionTitle, docsetIds: [] };
        byId.set(d.collection, fam);
        order.push(d.collection);
      }
      fam.docsetIds.push(d.id);
    }
    return order.map((id) => byId.get(id)!);
  }

  /** The family (collection) id a page's book belongs to. */
  collectionOf(nsId: string): string {
    return this.find(this.split(nsId).docsetId)?.collection ?? "";
  }

  /**
   * The products across all loaded books, unioned by id (first-seen title), in load
   * order — the options for the viewer's "Filter by product" scope. Unlike
   * `families()` (the merge key), a book may appear under several products.
   */
  products(): { id: string; title: string }[] {
    const byId = new Map<string, { id: string; title: string }>();
    const order: string[] = [];
    for (const d of this.docsets) {
      for (const p of d.products) {
        if (!byId.has(p.id)) {
          byId.set(p.id, p);
          order.push(p.id);
        }
      }
    }
    return order.map((id) => byId.get(id)!);
  }

  /** Whether the book a page belongs to is tagged with the given product. */
  pageInProduct(nsId: string, productId: string): boolean {
    const d = this.find(this.split(nsId).docsetId);
    return d ? d.products.some((p) => p.id === productId) : false;
  }

  /** Assets a loaded book references but can't resolve (pack not loaded). */
  missingAssets(docsetId: string): { path: string; pack: string }[] {
    return this.find(docsetId)?.missingAssets() ?? [];
  }

  tocTree(forceFolders: Set<string> = new Set()): TocNode[] {
    // Namespacing also covers a book's own folder nodes (`@folder:…` keys, v6):
    // the prefix keeps them unique across books, and `group` must ride along so
    // the tree renders them as expand/collapse-only rows.
    const nsNode = (docsetId: string, n: TocNode): TocNode => ({
      pageId: this.ns(docsetId, n.pageId),
      title: n.title,
      ...(n.group ? { group: true } : {}),
      children: n.children.map((c) => nsNode(docsetId, c)),
    });
    const rootsFor = (docsetId: string): TocNode[] =>
      this.find(docsetId)
        ?.tocTree()
        .map((n) => nsNode(docsetId, n)) ?? [];

    const fams = this.families();
    // One family → seamless flat merge, unless it offers a version/language switch,
    // which needs a folder header to hang the control on.
    const wrap = fams.length > 1 || fams.some((f) => forceFolders.has(f.id));
    if (!wrap) {
      return this.docsets.flatMap((d) => rootsFor(d.id));
    }
    // Each family is a collapsible top-level folder.
    return fams.map((f) => ({
      pageId: `@collection:${f.id}`,
      title: f.title,
      group: true,
      children: f.docsetIds.flatMap((id) => rootsFor(id)),
    }));
  }

  categories(): Category[] {
    const byId = new Map<string, Category>();
    for (const d of this.docsets) {
      for (const c of d.categories()) if (!byId.has(c.id)) byId.set(c.id, c);
    }
    return [...byId.values()];
  }

  keywords(): KeywordEntry[] {
    const byTerm = new Map<string, string[]>();
    for (const d of this.docsets) {
      for (const k of d.keywords()) {
        const ids = byTerm.get(k.term) ?? byTerm.set(k.term, []).get(k.term)!;
        for (const pid of k.pageIds) ids.push(this.ns(d.id, pid));
      }
    }
    return [...byTerm].map(([term, pageIds]) => ({ term, pageIds }));
  }

  async page(nsId: string): Promise<Page | null> {
    const { docsetId, localId } = this.split(nsId);
    const d = this.find(docsetId);
    if (!d) return null;
    const p = await d.page(localId);
    return p ? { ...p, id: this.ns(d.id, p.id) } : null;
  }

  async search(query: string, limit = 40): Promise<SearchHit[]> {
    const perBook = await Promise.all(
      this.docsets.map((d) => d.search(query, limit)),
    );
    // Every book ranks with FTS5 bm25 now, but raw bm25 magnitudes still aren't
    // comparable across books (they depend on each corpus's size/term stats). Scale
    // each book's hits to (0,1] by its own top score so results interleave fairly in
    // the merged ranking instead of one book crowding out the others.
    const hits = perBook.flatMap((list, bi) => {
      const top = Math.max(...list.map((h) => h.score), Number.EPSILON);
      const d = this.docsets[bi]!;
      return list.map((h) => ({
        ...h,
        pageId: this.ns(d.id, h.pageId),
        score: h.score / top,
      }));
    });
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }

  pagesByCategory(categoryId: string): string[] {
    return this.docsets.flatMap((d) =>
      d.pagesByCategory(categoryId).map((pid) => this.ns(d.id, pid)),
    );
  }

  /**
   * A page's "See also" related pages as fully-qualified ids. A stored id
   * containing `:` is already a cross-book `docsetId:localId`; otherwise it is local
   * to this page's book.
   */
  related(nsId: string): string[] {
    const { docsetId, localId } = this.split(nsId);
    const d = this.find(docsetId);
    if (!d) return [];
    return d
      .related(localId)
      .map((rid) => (rid.includes(SEP) ? rid : this.ns(docsetId, rid)));
  }

  private ns(docsetId: string, localId: string): string {
    return `${docsetId}${SEP}${localId}`;
  }
  private find(docsetId: string): IDocset | undefined {
    return this.docsets.find((d) => d.id === docsetId);
  }
}
