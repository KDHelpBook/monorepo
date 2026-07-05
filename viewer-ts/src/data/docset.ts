import type { Database } from "sql.js";
import { getSqlJs } from "./sql";

export interface TocNode {
  pageId: string;
  title: string;
  children: TocNode[];
}
export interface Category {
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
 * A read-only handle to one `.khb` docset, backed by sql.js. The queries mirror
 * `compiler/core/src/docset.rs` — keep the two in sync.
 */
export class Docset {
  private constructor(
    private readonly db: Database,
    readonly id: string,
    readonly language: string,
    readonly title: string,
    // Sidecar `.khba` attachment packs (zero or more), consulted in order after
    // the docset's own embedded `assets` table.
    private readonly attachments: Database[] = [],
  ) {}

  // sql.js is built without FTS5, so the prebuilt `pages_fts` index is unusable
  // in the browser. We search the stored `plain` text in JS instead (the native
  // CLI/Tauri path still uses real FTS5). Loaded lazily on first search.
  private searchDocs:
    { id: string; title: string; plain: string; keywords: string }[] | null =
    null;

  static async open(
    bytes: Uint8Array,
    attachmentBytes: Uint8Array[] = [],
  ): Promise<Docset> {
    const SQL = await getSqlJs();
    const db = new SQL.Database(bytes);
    const id = metaValue(db, "docset_id") ?? "docset";
    const language = metaValue(db, "language") ?? "en";
    const title = metaValue(db, "title") ?? id;
    const attachments = attachmentBytes.map((b) => new SQL.Database(b));
    return new Docset(db, id, language, title, attachments);
  }

  /**
   * Resolve an attachment (image or downloadable file) by path. Checks the
   * docset's embedded `assets` table first, then each sidecar `.khba` in order.
   * Tolerant of a v1 docset that predates the `assets` table.
   */
  asset(path: string): AssetBlob | null {
    for (const db of [this.db, ...this.attachments]) {
      const hit = queryAsset(db, path);
      if (hit) return hit;
    }
    return null;
  }

  meta(key: string): string | null {
    return metaValue(this.db, key);
  }

  tocTree(): TocNode[] {
    type Row = { id: number; pageId: string; title: string; position: number };
    const byParent = new Map<number | null, Row[]>();
    for (const r of all(
      this.db,
      "SELECT id, page_id, parent_id, position, title FROM toc",
    )) {
      const parent = r.parent_id == null ? null : Number(r.parent_id);
      const row: Row = {
        id: Number(r.id),
        pageId: String(r.page_id),
        title: String(r.title),
        position: Number(r.position),
      };
      const bucket = byParent.get(parent);
      if (bucket) bucket.push(row);
      else byParent.set(parent, [row]);
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

  categories(): Category[] {
    return all(
      this.db,
      "SELECT id, title FROM categories ORDER BY position",
    ).map((r) => ({
      id: String(r.id),
      title: String(r.title),
    }));
  }

  keywords(): KeywordEntry[] {
    const entries: KeywordEntry[] = [];
    for (const r of all(
      this.db,
      "SELECT term, page_id FROM keywords ORDER BY term, page_id",
    )) {
      const term = String(r.term);
      const pageId = String(r.page_id);
      const last = entries[entries.length - 1];
      if (last && last.term === term) last.pageIds.push(pageId);
      else entries.push({ term, pageIds: [pageId] });
    }
    return entries;
  }

  page(id: string): Page | null {
    const rows = all(
      this.db,
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

  search(query: string, limit = 40): SearchHit[] {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    this.searchDocs ??= all(
      this.db,
      "SELECT id, title, plain, keywords FROM pages",
    ).map((r) => ({
      id: String(r.id),
      title: String(r.title),
      plain: String(r.plain),
      keywords: String(r.keywords),
    }));

    const scored: { hit: SearchHit; score: number }[] = [];
    for (const doc of this.searchDocs) {
      const title = doc.title.toLowerCase();
      const keywords = doc.keywords.toLowerCase();
      const body = doc.plain.toLowerCase();
      let score = 0;
      for (const t of terms)
        score += occ(title, t) * 6 + occ(keywords, t) * 3 + occ(body, t);
      if (score > 0) {
        scored.push({
          score,
          hit: {
            pageId: doc.id,
            title: doc.title,
            snippet: snippet(doc.plain, terms),
            score,
          },
        });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.hit);
  }

  pagesByCategory(categoryId: string): string[] {
    return all(
      this.db,
      "SELECT page_id FROM page_categories WHERE category_id = ? ORDER BY page_id",
      [categoryId],
    ).map((r) => String(r.page_id));
  }

  close(): void {
    this.db.close();
    for (const db of this.attachments) db.close();
  }
}

/** Query one database's `assets` table, tolerating its absence (a v1 docset). */
function queryAsset(db: Database, path: string): AssetBlob | null {
  try {
    const rows = all(db, "SELECT mime, data FROM assets WHERE path = ?", [path]);
    const r = rows[0];
    if (!r) return null;
    return { mime: String(r.mime), data: r.data as Uint8Array };
  } catch {
    return null; // no `assets` table in this database
  }
}

type Row = Record<string, unknown>;

function all(
  db: Database,
  sql: string,
  params: (string | number)[] = [],
): Row[] {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows: Row[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as Row);
    return rows;
  } finally {
    stmt.free();
  }
}

function metaValue(db: Database, key: string): string | null {
  const rows = all(db, "SELECT value FROM meta WHERE key = ?", [key]);
  const r = rows[0];
  return r ? String(r.value) : null;
}

/** Count non-overlapping occurrences of `needle` in `hay`. */
function occ(hay: string, needle: string): number {
  if (!needle) return 0;
  let i = 0;
  let count = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) {
    count++;
    i += needle.length;
  }
  return count;
}

function escHtml(s: string): string {
  return s.replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c,
  );
}

/** A ~160-char excerpt around the first matched term, with terms highlighted. */
function snippet(text: string, terms: string[]): string {
  const low = text.toLowerCase();
  let pos = -1;
  for (const t of terms) {
    const i = low.indexOf(t);
    if (i !== -1 && (pos === -1 || i < pos)) pos = i;
  }
  if (pos === -1) pos = 0;
  const start = Math.max(0, pos - 45);
  let slice = escHtml(
    (start > 0 ? "…" : "") +
      text.slice(start, start + 160) +
      (start + 160 < text.length ? "…" : ""),
  );
  for (const t of terms) {
    if (!t) continue;
    const re = new RegExp(
      "(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")",
      "ig",
    );
    slice = slice.replace(re, "<mark>$1</mark>");
  }
  return slice;
}
