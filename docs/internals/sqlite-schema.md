---
title: SQLite schema
keywords: [schema, tables, meta, format_version, toc, pages, DDL]
categories: [internals, format]
related: [file-formats, full-text-search, building-a-compiler]
---

# SQLite schema

Every `.khb` contains the tables below, identified by `meta.format_version`
(currently **6**). The DDL is quoted from `compiler/core/src/schema.rs`, which —
together with `docs/format.md` — is the source of truth.

## Core tables

```sql [compiler/core/src/schema.rs]
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE pages (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  body_html TEXT NOT NULL,
  plain     TEXT NOT NULL,
  keywords  TEXT NOT NULL DEFAULT '',
  md        TEXT
);

CREATE TABLE toc (
  id        INTEGER PRIMARY KEY,
  page_id   TEXT REFERENCES pages(id),
  parent_id INTEGER REFERENCES toc(id),
  position  INTEGER NOT NULL,
  title     TEXT NOT NULL
);
CREATE INDEX idx_toc_parent ON toc(parent_id, position);
```

Three columns deserve a closer look:

- **`pages.plain`** is the page's plain text, stored for full-text search and
  snippets. It is the *only* copy of the searchable text — the FTS index references
  it rather than duplicating it (see [Full-text search](full-text-search)).
- **`pages.keywords`** is a space-joined copy of the page's keyword terms, present
  only so the FTS index can tokenize it. The *structured* F1 index lives in the
  `keywords` table below.
- **`pages.md`** (v5, nullable) is an **optional** clean-Markdown rendition of the
  body. The viewer never reads it — `body_html` is the canonical render — it exists
  for AI-facing consumers (the `llms.txt` export, a future MCP `get_page`). It is
  deliberately the **last** column: SQLite serialises a row column-by-column and
  stops at the last requested column, so hot-path reads (`SELECT id, title,
  body_html`) never stream its bytes.
- **`toc.page_id`** is `NULL` for a **pure folder node** (v6): a grouping row that
  only holds children and cannot be opened. `NULL` passes the foreign-key check by
  design.

## Facets, keywords and "See also"

```sql [compiler/core/src/schema.rs]
CREATE TABLE categories (
  id       TEXT PRIMARY KEY,
  title    TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE page_categories (
  page_id     TEXT NOT NULL REFERENCES pages(id),
  category_id TEXT NOT NULL REFERENCES categories(id),
  PRIMARY KEY (page_id, category_id)
);

CREATE TABLE keywords (
  term    TEXT NOT NULL,
  page_id TEXT NOT NULL REFERENCES pages(id),
  PRIMARY KEY (term, page_id)
);
CREATE INDEX idx_keywords_term ON keywords(term);

CREATE TABLE related (
  page_id    TEXT NOT NULL REFERENCES pages(id),
  related_id TEXT NOT NULL,
  position   INTEGER NOT NULL,
  PRIMARY KEY (page_id, related_id)
);
CREATE INDEX idx_related_page ON related(page_id, position);

CREATE TABLE products (
  id       TEXT PRIMARY KEY,
  title    TEXT NOT NULL,
  position INTEGER NOT NULL
);
```

- **Categories are a facet** (tags, many-to-many), independent of the TOC
  hierarchy.
- **`related`** holds the curated "See also" links, ordered by `position`.
  `related_id` is a page id in this book *or* a namespaced `docsetId:localId` for a
  cross-book link — which is why it has no foreign key.
- **`products`** is the "Filter by product" facet, separate from
  `meta.collection` (the merge/family key). A docset with no explicit products
  defaults to one named after its collection.

## Assets and routing

```sql [compiler/core/src/schema.rs]
CREATE TABLE assets (
  path TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  data BLOB NOT NULL
);

CREATE TABLE asset_index (
  path TEXT PRIMARY KEY,
  pack TEXT NOT NULL
);
```

`assets` is present (possibly empty) in every `.khb` and is the sole content table
of a sidecar `.khba`. `asset_index` routes each path to its store — `pack` is `''`
for embedded, otherwise the owning sidecar's `meta.pack` id — so resolution is one
lookup, never a probe across packs (see [File formats](file-formats)).

## `meta` keys

| Key | Meaning |
|-----|---------|
| `format_version` | schema version this file conforms to (currently `6`) |
| `docset_id` | the book's id — the namespace prefix in `docsetId:pageId` links |
| `title` | display title |
| `version` | content version (drives the viewer's version switcher) |
| `language` | content language; also selects the FTS tokenizer |
| `tokenizer` | the FTS5 tokenizer string actually used at build time |
| `generator` | the producing tool, e.g. `khb-core 0.1.0` |
| `collection` | family/merge key (v3) — books sharing it merge in the viewer |

## Format version history

Each bump also changed the rendered-docset layout that `.khbb` encodes, so a
`.khbb` is validated against exactly this number.

| Version | Added |
|---------|-------|
| 1 | the initial schema |
| 2 | binary attachments: the `assets` table and sidecar `.khba` files |
| 3 | family metadata: `meta.collection` |
| 4 | the `related` ("See also") table |
| 5 | the optional, nullable `pages.md` column (clean Markdown for llms.txt / MCP) |
| 6 | page-less TOC folder nodes: `toc.page_id` became nullable |

> [!NOTE]
> There is also a language-dependent virtual table, `pages_fts`, created with a
> per-docset tokenizer rather than fixed DDL — it gets its own page:
> [Full-text search](full-text-search).
