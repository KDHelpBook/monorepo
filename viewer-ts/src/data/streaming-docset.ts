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
import { buildTocTree } from "./docset";
import { StreamingDb } from "./streaming";

/** The meta a `peek` returns — enough to group a book and label it in the library. */
export interface DocsetMeta {
  id: string;
  language: string;
  title: string;
  collection: string;
  version: string;
}

/** Open each sidecar source, skipping any that fail (their assets just won't resolve). */
async function openSidecars<T>(
  srcs: T[],
  open: (s: T) => Promise<StreamingDb>,
): Promise<StreamingDb[]> {
  const out: StreamingDb[] = [];
  for (const s of srcs) {
    try {
      out.push(await open(s));
    } catch {
      /* invalid/unreachable sidecar — skip it */
    }
  }
  return out;
}

/**
 * The one browser `IDocset` engine, backed by the custom FTS5 wa-sqlite build. It
 * serves **both** a remote `.khb` streamed page-by-page over HTTP `Range` (`open`)
 * and a whole `.khb` already in memory (`openBytes` — upload / bundled); the only
 * difference is the {@link BlockReader} byte source. Every book gets real FTS5.
 *
 * The split that makes it pay off (and keeps navigation instant): the **small
 * structural tables** (toc,
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
   * Cheaply read just `meta` (a few KB) — enough to validate a `.khb` and learn
   * its language for collection grouping, without eager-loading the whole
   * structure. `peek` streams it over Range; `peekBytes` reads it from memory.
   */
  static async peek(url: string): Promise<DocsetMeta> {
    return StreamingDocset.peekDb(await StreamingDb.open(url));
  }
  static async peekBytes(bytes: Uint8Array): Promise<DocsetMeta> {
    return StreamingDocset.peekDb(await StreamingDb.openBytes(bytes));
  }
  private static async peekDb(db: StreamingDb): Promise<DocsetMeta> {
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

  /** Open a remote `.khb` streamed page-by-page over HTTP `Range` (+ sidecar URLs). */
  static async open(
    url: string,
    sidecarUrls: string[] = [],
  ): Promise<StreamingDocset> {
    return StreamingDocset.build(
      await StreamingDb.open(url),
      await openSidecars(sidecarUrls, (u) => StreamingDb.open(u)),
    );
  }

  /**
   * Open a whole `.khb` already in memory (upload / bundled / whole-fetch), plus any
   * sidecar `.khba` byte packs. Same eager-structure + real-FTS5 engine as streaming —
   * just an in-memory byte source instead of HTTP Range, so no network.
   */
  static async openBytes(
    bytes: Uint8Array,
    sidecarBytes: Uint8Array[] = [],
  ): Promise<StreamingDocset> {
    return StreamingDocset.build(
      await StreamingDb.openBytes(bytes),
      await openSidecars(sidecarBytes, (b) => StreamingDb.openBytes(b)),
    );
  }

  /** Read the meta + all small structural tables eagerly, and key the sidecars. */
  private static async build(
    db: StreamingDb,
    sidecars: StreamingDb[],
  ): Promise<StreamingDocset> {
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
    const toc = buildTocTree(
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

    // Key each already-open sidecar `.khba` by its `meta.pack`, so the `asset_index`
    // routing can address one directly (order-independent).
    const byPack = new Map<string, StreamingDb>();
    for (const pack of sidecars) {
      try {
        const packId = await pack.one(
          "SELECT value FROM meta WHERE key='pack'",
        );
        if (packId != null) byPack.set(String(packId), pack);
        else pack.close();
      } catch {
        pack.close(); // invalid sidecar — its assets just won't resolve
      }
    }

    // Assets routed to a sidecar pack that isn't loaded → missing (computed once).
    let missing: { path: string; pack: string }[] = [];
    try {
      missing = (
        await db.all("SELECT path, pack FROM asset_index WHERE pack != ''")
      )
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
