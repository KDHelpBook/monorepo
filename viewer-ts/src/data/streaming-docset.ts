import type {
  AssetBlob,
  Category,
  IDocset,
  KeywordEntry,
  Page,
  Product,
  SearchHit,
  TocNode,
} from "./docset";
import { StreamingDb } from "./streaming";

/**
 * A book streamed from a remote `.khb` over HTTP `Range`, page by page — the
 * `IDocset` the live `Collection` merges alongside whole-file (sql.js) books.
 *
 * The split that makes streaming pay off: the **small structural tables** (toc,
 * categories, keywords, page↔category, related) are read **once at open** and
 * kept in memory, so every navigational query is synchronous and local; only the
 * **heavy, per-navigation data** streams on demand — a page body, an embedded
 * asset, or a full-text search. Search is **real FTS5** (bm25-ranked), reading
 * just the index pages a query touches — the payoff of the custom wa-sqlite
 * build (`vendor/wa-sqlite/`).
 */
export class StreamingDocset implements IDocset {
  private constructor(
    private readonly db: StreamingDb,
    readonly id: string,
    readonly language: string,
    readonly title: string,
    readonly collection: string,
    readonly collectionTitle: string,
    readonly version: string,
    readonly products: Product[],
    private readonly toc: TocNode[],
    private readonly cats: Category[],
    private readonly kws: KeywordEntry[],
    private readonly byCategory: Map<string, string[]>,
    private readonly relatedById: Map<string, string[]>,
    private readonly hasFts5: boolean,
    // Sidecar `.khba` packs keyed by their `meta.pack`, each its own streamed
    // connection — so `asset_index` can route an asset straight to its store.
    private readonly byPack: Map<string, StreamingDb>,
    // Assets whose owning pack isn't loaded (computed eagerly at open).
    private readonly missing: { path: string; pack: string }[],
  ) {}

  missingAssets(): { path: string; pack: string }[] {
    return this.missing;
  }

  /**
   * Cheaply read just `meta` over Range (a few KB) — enough to validate the URL
   * is a Range-served `.khb` and to learn its language for collection grouping,
   * without eager-loading the whole structure.
   */
  static async peek(url: string): Promise<{
    id: string;
    language: string;
    title: string;
    collection: string;
    version: string;
  }> {
    const db = await StreamingDb.open(url);
    try {
      const val = async (k: string): Promise<string | null> => {
        const v = await db.one("SELECT value FROM meta WHERE key = ?", [k]);
        return v == null ? null : String(v);
      };
      const id = (await val("docset_id")) ?? "docset";
      return {
        id,
        language: (await val("language")) ?? "en",
        title: (await val("title")) ?? id,
        collection: (await val("collection")) ?? id,
        version: (await val("version")) ?? "",
      };
    } finally {
      db.close();
    }
  }

  static async open(
    url: string,
    sidecarUrls: string[] = [],
  ): Promise<StreamingDocset> {
    const db = await StreamingDb.open(url);
    const meta = async (k: string): Promise<string | null> => {
      const v = await db.one("SELECT value FROM meta WHERE key = ?", [k]);
      return v == null ? null : String(v);
    };
    const id = (await meta("docset_id")) ?? "docset";
    const language = (await meta("language")) ?? "en";
    const title = (await meta("title")) ?? id;
    const collection = (await meta("collection")) ?? id;
    const collectionTitle = (await meta("collection_title")) ?? title;
    const version = (await meta("version")) ?? "";

    // --- eager structure (all small tables) ---
    const toc = buildToc(
      await db.all("SELECT id, page_id, parent_id, position, title FROM toc"),
    );
    const cats: Category[] = (
      await db.all("SELECT id, title FROM categories ORDER BY position")
    ).map((r) => ({ id: String(r.id), title: String(r.title) }));

    // Products (many-to-many facet); default to one = the collection when absent.
    let products: Product[] = [];
    try {
      products = (
        await db.all("SELECT id, title FROM products ORDER BY position")
      ).map((r) => ({ id: String(r.id), title: String(r.title) }));
    } catch {
      /* older `.khb` predates the products table */
    }
    if (!products.length)
      products = [{ id: collection, title: collectionTitle }];

    const kws: KeywordEntry[] = [];
    for (const r of await db.all(
      "SELECT term, page_id FROM keywords ORDER BY term, page_id",
    )) {
      const term = String(r.term);
      const pageId = String(r.page_id);
      const last = kws[kws.length - 1];
      if (last && last.term === term) last.pageIds.push(pageId);
      else kws.push({ term, pageIds: [pageId] });
    }

    const byCategory = new Map<string, string[]>();
    for (const r of await db.all(
      "SELECT category_id, page_id FROM page_categories ORDER BY page_id",
    )) {
      const cid = String(r.category_id);
      (byCategory.get(cid) ?? byCategory.set(cid, []).get(cid)!).push(
        String(r.page_id),
      );
    }

    const relatedById = new Map<string, string[]>();
    try {
      for (const r of await db.all(
        "SELECT page_id, related_id FROM related ORDER BY position",
      )) {
        const pid = String(r.page_id);
        (relatedById.get(pid) ?? relatedById.set(pid, []).get(pid)!).push(
          String(r.related_id),
        );
      }
    } catch {
      /* docset predates v4 (no `related` table) */
    }

    // Is this a real FTS5 build? (Our custom wa-sqlite is; a fallback wouldn't be.)
    let hasFts5 = true;
    try {
      await db.one("SELECT rowid FROM pages_fts LIMIT 1");
    } catch {
      hasFts5 = false;
    }

    // Open each sidecar `.khba` over Range and key it by its `meta.pack`, so the
    // `asset_index` routing can address one directly (order-independent).
    const byPack = new Map<string, StreamingDb>();
    for (const sidecarUrl of sidecarUrls) {
      try {
        const pack = await StreamingDb.open(sidecarUrl);
        const packId = await pack.one(
          "SELECT value FROM meta WHERE key='pack'",
        );
        if (packId != null) byPack.set(String(packId), pack);
        else pack.close();
      } catch {
        /* unreachable/invalid sidecar — its assets just won't resolve */
      }
    }

    // Assets routed to a sidecar pack that isn't loaded → missing (computed once).
    let missing: { path: string; pack: string }[] = [];
    try {
      missing = (await db.all("SELECT path, pack FROM asset_index WHERE pack != ''"))
        .map((r) => ({ path: String(r.path), pack: String(r.pack) }))
        .filter((a) => !byPack.has(a.pack));
    } catch {
      /* older docset without an asset_index */
    }

    return new StreamingDocset(
      db,
      id,
      language,
      title,
      collection,
      collectionTitle,
      version,
      products,
      toc,
      cats,
      kws,
      byCategory,
      relatedById,
      hasFts5,
      byPack,
      missing,
    );
  }

  // --- synchronous structure (served from the eager caches) ---
  tocTree(): TocNode[] {
    return this.toc;
  }
  categories(): Category[] {
    return this.cats;
  }
  keywords(): KeywordEntry[] {
    return this.kws;
  }
  pagesByCategory(categoryId: string): string[] {
    return this.byCategory.get(categoryId) ?? [];
  }
  related(id: string): string[] {
    return this.relatedById.get(id) ?? [];
  }

  // --- streamed on demand ---
  async page(id: string): Promise<Page | null> {
    const rows = await this.db.all(
      "SELECT id, title, body_html FROM pages WHERE id = ?",
      [id],
    );
    const r = rows[0];
    return r
      ? {
          id: String(r.id),
          title: String(r.title),
          bodyHtml: String(r.body_html),
        }
      : null;
  }

  async asset(path: string): Promise<AssetBlob | null> {
    // Route via the index to the owning store: the main `.khb`'s embedded `assets`
    // (pack "") or the streamed sidecar `.khba` whose `meta.pack` matches.
    const pack = await this.db.one(
      "SELECT pack FROM asset_index WHERE path = ?",
      [path],
    );
    if (pack == null) return null;
    const store = String(pack) === "" ? this.db : this.byPack.get(String(pack));
    if (!store) return null; // sidecar not loaded
    const rows = await store.all(
      "SELECT mime, data FROM assets WHERE path = ?",
      [path],
    );
    const r = rows[0];
    return r ? { mime: String(r.mime), data: r.data as Uint8Array } : null;
  }

  async search(query: string, limit = 40): Promise<SearchHit[]> {
    if (!this.hasFts5) return [];
    // Clean tokens → a safe FTS5 prefix-OR query (no user syntax reaches FTS5).
    const tokens = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    if (!tokens.length) return [];
    const match = tokens.map((t) => `${t}*`).join(" OR ");
    // Sentinel delimiters so we can HTML-escape the snippet, then re-insert marks
    // (the results render in the app UI, not the sandbox, so they must be safe).
    const rows = await this.db.all(
      `SELECT p.id AS id, p.title AS title,
              snippet(pages_fts, 1, char(1), char(2), '…', 12) AS snip,
              bm25(pages_fts) AS score
       FROM pages_fts f JOIN pages p ON p.rowid = f.rowid
       WHERE pages_fts MATCH ?
       ORDER BY bm25(pages_fts) LIMIT ?`,
      [match, limit],
    );
    return rows.map((r) => ({
      pageId: String(r.id),
      title: String(r.title),
      snippet: marks(escHtml(String(r.snip ?? ""))),
      // bm25 is "lower = better"; negate so the collection's higher-is-better
      // merge/sort ranks the best hits first.
      score: -Number(r.score),
    }));
  }

  close(): void {
    this.db.close();
    for (const pack of this.byPack.values()) pack.close();
  }
}

/** Build the TOC tree from flat rows (mirrors docset.ts). */
function buildToc(rows: Record<string, unknown>[]): TocNode[] {
  type Row = { id: number; pageId: string; title: string; position: number };
  const byParent = new Map<number | null, Row[]>();
  for (const r of rows) {
    const parent = r.parent_id == null ? null : Number(r.parent_id);
    const row: Row = {
      id: Number(r.id),
      pageId: String(r.page_id),
      title: String(r.title),
      position: Number(r.position),
    };
    (byParent.get(parent) ?? byParent.set(parent, []).get(parent)!).push(row);
  }
  const build = (parent: number | null): TocNode[] =>
    (byParent.get(parent) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((e) => ({
        pageId: e.pageId,
        title: e.title,
        children: build(e.id),
      }));
  return build(null);
}

function escHtml(s: string): string {
  return s.replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c,
  );
}

/** Replace the FTS5 snippet sentinels (char(1)/char(2)) with <mark> tags. */
function marks(s: string): string {
  return s.replaceAll("\u0001", "<mark>").replaceAll("\u0002", "</mark>");
}
