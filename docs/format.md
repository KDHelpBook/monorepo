# The `.khb` format

A **`.khb`** ("Help Book") is an ordinary **SQLite** database. Everything the
viewer needs is precomputed at build time, so search is instant and works offline.
Because it is plain SQLite, anything that reads SQLite can open it.

Two smaller delivery variants exist:

| Extension | What it is | Read by |
|-----------|------------|---------|
| `.khb`  | the SQLite docset (the canonical, queried form) | native SQLite / sql.js |
| `.khbc` | gzip of a `.khb` (smaller download) | decompressed in-browser, then as `.khb` |
| `.khbb` | a minimal binary (no indexes) | rebuilt into a `.khb` before use |

The format is **independent of the source format**: a `.khb` stores rendered HTML,
never Markdown. The bundled compiler happens to take Markdown, but any front end
can produce a valid `.khb`.

## SQLite schema

`meta.format_version` identifies the schema version (currently `1`).

```sql
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE pages (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  body_html TEXT NOT NULL,   -- rendered HTML (no source Markdown is stored)
  plain     TEXT NOT NULL,   -- plain text, for FTS + snippets
  keywords  TEXT NOT NULL    -- space-joined terms, for FTS only
);

CREATE TABLE toc (
  id        INTEGER PRIMARY KEY,
  page_id   TEXT NOT NULL REFERENCES pages(id),
  parent_id INTEGER REFERENCES toc(id),
  position  INTEGER NOT NULL,
  title     TEXT NOT NULL
);

CREATE TABLE categories (id TEXT PRIMARY KEY, title TEXT NOT NULL, position INTEGER NOT NULL);
CREATE TABLE page_categories (page_id TEXT, category_id TEXT, PRIMARY KEY (page_id, category_id));
CREATE TABLE keywords (term TEXT, page_id TEXT, PRIMARY KEY (term, page_id));

-- External-content FTS5: the index holds only the inverted index, not a second
-- copy of the text (which lives once in `pages`).
CREATE VIRTUAL TABLE pages_fts USING fts5(
  title, plain, keywords,
  content='pages', content_rowid='rowid',
  tokenize='<tokenizer>'
);
```

The database is `VACUUM`ed after writing.

### `meta` keys

`format_version`, `docset_id`, `title`, `version`, `language`, `tokenizer`,
`generator`.

### Tokenizer

Chosen from `meta.language` at build time:

| Language | Tokenizer |
|----------|-----------|
| `en`     | `porter unicode61 remove_diacritics 2` (English stemming: *fox* matches *foxes*) |
| other    | `unicode61 remove_diacritics 2` (diacritics folded, no stemmer) |

### Search

Full-text search is a single FTS5 query with `bm25()` ranking and `snippet()`
highlighting:

```sql
SELECT p.id, p.title,
       snippet(pages_fts, 1, '<mark>', '</mark>', '…', 12) AS snip,
       -bm25(pages_fts) AS score
FROM pages_fts JOIN pages p ON p.rowid = pages_fts.rowid
WHERE pages_fts MATCH ?
ORDER BY score DESC;
```

> **Browser note.** The stock `sql.js` build lacks FTS5, so the browser viewer
> searches the stored `plain` column in JS instead. Native (CLI/Tauri) uses the
> real FTS5 index. Keep the two query paths in sync.

## `.khbb` (binary)

`.khbb` is a compact [postcard](https://docs.rs/postcard) encoding of the rendered
docset (pages as HTML + plain text, the TOC, categories and keywords) — **no
SQLite container and no FTS index**. It is the smallest way to ship a docset; the
consumer rebuilds a real `.khb` from it. It is a versioned wrapper so it can be
validated before use.
