export interface TocNode {
  /** A real page id — or a synthetic `@folder:…` / `@collection:…` key for a
   *  folder node (`group: true`), which is never navigable. */
  pageId: string;
  title: string;
  children: TocNode[];
  /** True for a folder node: a book's page-less TOC folder (format v6) or a
   *  synthetic family/product folder. Clicking it only expands/collapses. */
  group?: boolean;
}
export interface Category {
  id: string;
  title: string;
}
/** A product a book belongs to (many-to-many facet, separate from `collection`). */
export interface Product {
  id: string;
  title: string;
}
export interface KeywordEntry {
  term: string;
  pageIds: string[];
}
export interface Page {
  id: string;
  title: string;
  bodyHtml: string;
}
export interface AssetBlob {
  mime: string;
  data: Uint8Array;
}
export interface SearchHit {
  pageId: string;
  title: string;
  snippet: string;
  score: number;
}

/**
 * The common shape of a loaded book. In the browser every docset is backed by the
 * one wa-sqlite engine (`streaming-docset.ts`) — whether whole-file (in-memory
 * bytes) or streamed page-by-page over HTTP `Range`; the native CLI/Tauri path uses
 * the Rust `core`. Structural queries are **synchronous** — they read small tables
 * kept in memory after an eager load. The heavy, per-navigation data is
 * **asynchronous**: a page body, an attachment, or an FTS5 search may stream on
 * demand (or, whole-file, resolve from memory).
 */
export interface IDocset {
  readonly id: string;
  readonly language: string;
  readonly title: string;
  readonly collection: string;
  readonly collectionTitle: string;
  /** Content version (`meta.version`); "" if the docset declares none. */
  readonly version: string;
  /** Products this book belongs to (many-to-many); defaults to one = its collection. */
  readonly products: Product[];
  tocTree(): TocNode[];
  /** Assets whose owning `.khba` pack isn't loaded (path + expected pack id) —
   *  what "locate missing assets" in Manage docsets needs. Empty when all resolve. */
  missingAssets(): { path: string; pack: string }[];
  categories(): Category[];
  keywords(): KeywordEntry[];
  pagesByCategory(categoryId: string): string[];
  related(id: string): string[];
  page(id: string): Promise<Page | null>;
  asset(path: string): Promise<AssetBlob | null>;
  search(query: string, limit?: number): Promise<SearchHit[]>;
  close(): void;
}

type Row = Record<string, unknown>;

/**
 * Build the TOC tree from flat `toc` rows. A row with a NULL `page_id` is a pure
 * folder node (format v6): it gets `group: true` and a synthetic `@folder:<slug-path>`
 * key — stable across reloads (it derives from the title path, not from rowids), so
 * the tree's persisted expanded-state keeps working, and never navigable (folder keys
 * are excluded from the page map exactly like the family folders' `@collection:` keys).
 */
export function buildTocTree(rows: Row[]): TocNode[] {
  type Flat = {
    id: number;
    pageId: string | null;
    title: string;
    position: number;
  };
  const byParent = new Map<number | null, Flat[]>();
  for (const r of rows) {
    const parent = r.parent_id == null ? null : Number(r.parent_id);
    const row: Flat = {
      id: Number(r.id),
      pageId: r.page_id == null ? null : String(r.page_id),
      title: String(r.title),
      position: Number(r.position),
    };
    const bucket = byParent.get(parent);
    if (bucket) bucket.push(row);
    else byParent.set(parent, [row]);
  }
  const slug = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const build = (parent: number | null, path: string): TocNode[] =>
    (byParent.get(parent) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((e) => {
        if (e.pageId != null) {
          return {
            pageId: e.pageId,
            title: e.title,
            children: build(e.id, path),
          };
        }
        const key = `${path}/${slug(e.title)}`;
        return {
          pageId: `@folder:${key}`,
          title: e.title,
          group: true,
          children: build(e.id, key),
        };
      });
  return build(null, "");
}
