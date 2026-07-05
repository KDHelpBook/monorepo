import {
  Docset,
  type AssetBlob,
  type Category,
  type KeywordEntry,
  type Page,
  type SearchHit,
  type TocNode,
} from "./docset";

const SEP = ":";

/** A sidecar `.khba` attachment pack: in-memory bytes or a URL (`.gz` = gzip'd). */
export type AttachmentSource = { bytes: Uint8Array } | { file: string };

/**
 * A docset to load: either already-in-memory bytes or a URL, with zero or more
 * `.khba` attachment packs. A URL ending in `.gz` is gzip-compressed and gets
 * decompressed after fetch (applies to `.khb`/`.khba`/`.khbp` alike).
 */
export type DocsetSource = ({ bytes: Uint8Array } | { file: string }) & {
  attachments?: AttachmentSource[];
};

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
async function fetchMaybeGz(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
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
    private readonly docsets: Docset[],
  ) {}

  static async load(
    sources: DocsetSource[],
    language: string,
  ): Promise<Collection> {
    const docsets: Docset[] = [];
    for (const src of sources) {
      let bytes: Uint8Array;
      if ("bytes" in src) {
        bytes = src.bytes;
      } else {
        bytes = await fetchMaybeGz(src.file);
      }
      const attachmentBytes: Uint8Array[] = [];
      for (const a of src.attachments ?? []) {
        attachmentBytes.push(
          "bytes" in a ? a.bytes : await fetchMaybeGz(a.file),
        );
      }
      docsets.push(await Docset.open(bytes, attachmentBytes));
    }
    return new Collection(language, docsets);
  }

  /** Resolve an attachment (`asset:<path>`) referenced by a page in `fromNsId`. */
  asset(fromNsId: string, path: string): AssetBlob | null {
    return this.find(this.split(fromNsId).docsetId)?.asset(path) ?? null;
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

  /** The books (docsets) in this collection, for scope filters. */
  books(): { id: string; title: string }[] {
    return this.docsets.map((d) => ({ id: d.id, title: d.title }));
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

  tocTree(): TocNode[] {
    const nsNode = (docsetId: string, n: TocNode): TocNode => ({
      pageId: this.ns(docsetId, n.pageId),
      title: n.title,
      children: n.children.map((c) => nsNode(docsetId, c)),
    });
    const rootsFor = (docsetId: string): TocNode[] =>
      this.find(docsetId)?.tocTree().map((n) => nsNode(docsetId, n)) ?? [];

    const fams = this.families();
    // One family (or one book) → seamless flat merge, no wrapper folder.
    if (fams.length <= 1) {
      return this.docsets.flatMap((d) => rootsFor(d.id));
    }
    // Several products → each family is a collapsible top-level folder.
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

  page(nsId: string): Page | null {
    const { docsetId, localId } = this.split(nsId);
    const d = this.find(docsetId);
    const p = d?.page(localId);
    return p ? { ...p, id: this.ns(d!.id, p.id) } : null;
  }

  search(query: string, limit = 40): SearchHit[] {
    const hits = this.docsets.flatMap((d) =>
      d
        .search(query, limit)
        .map((h) => ({ ...h, pageId: this.ns(d.id, h.pageId) })),
    );
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }

  pagesByCategory(categoryId: string): string[] {
    return this.docsets.flatMap((d) =>
      d.pagesByCategory(categoryId).map((pid) => this.ns(d.id, pid)),
    );
  }

  private ns(docsetId: string, localId: string): string {
    return `${docsetId}${SEP}${localId}`;
  }
  private find(docsetId: string): Docset | undefined {
    return this.docsets.find((d) => d.id === docsetId);
  }
}
