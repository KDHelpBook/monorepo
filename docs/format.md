# The `.khb` format

A **`.khb`** ("Help Book") is an ordinary **SQLite** database. Everything the
viewer needs is precomputed at build time, so search is instant and works offline.
Because it is plain SQLite, anything that reads SQLite can open it.

The family:

| Extension | What it is | Read by |
|-----------|------------|---------|
| `.khb`  | the SQLite docset (the canonical, queried form) | native SQLite / sql.js |
| `.khbb` | a minimal binary (no indexes) | rebuilt into a `.khb` before use |
| `.khba` | a sidecar SQLite file of attachments (images, downloads) | opened beside its `.khb` |

**Compression** is an orthogonal `.gz` suffix, not a distinct format: any of the
files above may be shipped gzip-compressed as `<name>.gz` (`foo.khb.gz`,
`foo.khba.gz`, …) and decompressed after fetch. The viewer decides by the gzip magic
bytes (`1f 8b`), not the name — so a host that auto-applies `Content-Encoding: gzip`
for `.gz` files (and thus pre-decompresses) works just as well as one that serves the
bytes verbatim.

The format is **independent of the source format**: a `.khb` stores rendered HTML,
never Markdown. The bundled compiler happens to take Markdown, but any front end
can produce a valid `.khb`.

## SQLite schema

`meta.format_version` identifies the schema version (currently `4`: `assets` was
added in v2, `meta.collection` in v3, and the `related` table in v4).

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

-- Curated "See also" links. `related_id` is a page id in this book, or a
-- namespaced `docsetId:localId` for a cross-book link (hence no foreign key).
CREATE TABLE related (page_id TEXT, related_id TEXT, position INTEGER, PRIMARY KEY (page_id, related_id));

-- Binary attachments: images and downloadable files referenced by pages as
-- `asset:<path>`. Present (possibly empty) in every `.khb`; the sole content
-- table of a sidecar `.khba`.
CREATE TABLE assets (path TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL);

-- Asset routing: which store holds each asset. `pack` is '' for an asset embedded
-- in this .khb, otherwise the owning sidecar's `meta.pack` id. Lets resolution go
-- straight to one store instead of probing every attachment pack.
CREATE TABLE asset_index (path TEXT PRIMARY KEY, pack TEXT NOT NULL);

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

## Attachments (`assets` + `.khba`)

Images and downloadable files live in the `assets` table, keyed by a docset-relative
path (e.g. `assets/diagram.svg`). Pages reference them via the **`asset:<path>`**
scheme, which the compiler rewrites from ordinary `assets/…` image/link targets; the
viewer resolves each `asset:` URL to a blob URL at load time (images render inline,
other types become download links). Plain text and the FTS index are unaffected.

Attachments can be stored two ways:

- **Embedded** — the `assets` table is populated inside the `.khb` itself.
- **Sidecar `.khba`** — a small separate SQLite file (a `meta` table plus the same
  `assets` table) shipped next to a lean `.khb` whose own `assets` table is empty.
  Each sidecar carries a stable id in `meta.pack` (its filename).

A single `.khb` may be backed by **several** `.khba` packs. Rather than probe every
store, resolution uses the `.khb`'s `asset_index`: look up the path once to learn its
`pack`, then read only that store — the embedded `assets` table (`pack = ''`) or the
sidecar whose `meta.pack` matches. Routing by id (not position) means the packs can
be opened in any order — e.g. re-uploaded by the user — and still resolve. This also
keeps resolution cheap when packs are **streamed** over HTTP: one lookup, one ranged
read of the right file, instead of N probes (see [streaming.md](streaming.md)).

In a packed distribution, `docsets.json` lists a docset's attachment packs in an
`attachments` array; `kdhelp pack`/`patch` auto-detect the sibling files `foo.khba`
and `foo.<tag>.khba` next to `foo.khb` and rebuild `asset_index` to cover them all.

## `.khbb` (binary)

`.khbb` is a compact [postcard](https://docs.rs/postcard) encoding of the rendered
docset (pages as HTML + plain text, the TOC, categories, keywords **and embedded
assets**) — **no SQLite container and no FTS index**. It is the smallest way to ship
a docset; the consumer rebuilds a real `.khb` from it. It is a versioned wrapper so
it can be validated before use.
