import {
  Docset,
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
 * A docset to load:
 * - `{ bytes }` — already-in-memory (upload / IndexedDB), whole-file sql.js;
 * - `{ file }` — a URL fetched **whole** (a `.gz` suffix is decompressed);
 * - `{ url, mode: "streaming" }` — a remote `.khb` opened **page-by-page** over
 *   HTTP `Range` via the wa-sqlite engine (real FTS5), never fetched whole.
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

export async function fetchDocsetBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return bytes[0] === 0x1f && bytes[1] === 0x8b ? await gunzip(bytes) : bytes;
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

  /** Close every docset (frees sql.js / streaming handles) — used before a live
   *  swap when the loaded set changes (version/language switch). */
  close(): void {
    for (const d of this.docsets) d.close();
  }

  static async load(
    sources: DocsetSource[],
    language: string,
  ): Promise<Collection> {
    const docsets: IDocset[] = [];
    for (const src of sources) {
      if (isStreaming(src)) {
        // Lazy-load the wa-sqlite streaming engine only when a streamed docset is
        // actually opened, so non-streaming sessions never fetch that chunk.
        const { StreamingDocset } = await import("./streaming-docset");
        docsets.push(
          await StreamingDocset.open(src.url, src.attachments ?? []),
        );
        continue;
      }
      const bytes =
        "bytes" in src ? src.bytes : await fetchDocsetBytes(src.file);
      const attachmentBytes: Uint8Array[] = [];
      for (const a of src.attachments ?? []) {
        attachmentBytes.push(
          "bytes" in a ? a.bytes : await fetchDocsetBytes(a.file),
        );
      }
      docsets.push(await Docset.open(bytes, attachmentBytes));
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

  tocTree(forceFolders: Set<string> = new Set()): TocNode[] {
    const nsNode = (docsetId: string, n: TocNode): TocNode => ({
      pageId: this.ns(docsetId, n.pageId),
      title: n.title,
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
    // Different backends score differently (sql.js's occurrence heuristic vs the
    // streamed books' FTS5 bm25), and the raw magnitudes aren't comparable. Scale
    // each book's hits to (0,1] by its own top score so results interleave fairly
    // in the merged ranking instead of one engine crowding out the other.
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
