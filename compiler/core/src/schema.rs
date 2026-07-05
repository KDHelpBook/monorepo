//! The `.khb` SQLite schema and FTS5 tokenizer selection.
//!
//! `.khb` is a plain SQLite database. Everything the viewer needs is precomputed
//! at build time: the table of contents, the category facet, the F1 keyword index
//! and a full-text index. Text is stored **once** — the FTS5 index uses
//! `content='pages'` (external content) so it holds only the inverted index, not a
//! second copy of the page text.

/// Structural tables (everything except the FTS virtual table, which is created
/// with a language-dependent tokenizer — see [`create_fts_sql`]).
pub const SCHEMA_SQL: &str = r#"
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- `keywords` here is a space-joined copy of a page's keyword terms, present only
-- so the external-content FTS5 index can tokenize it. The structured F1 index
-- lives in the `keywords` table below.
CREATE TABLE pages (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  body_html TEXT NOT NULL,
  plain     TEXT NOT NULL,
  keywords  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE toc (
  id        INTEGER PRIMARY KEY,
  page_id   TEXT NOT NULL REFERENCES pages(id),
  parent_id INTEGER REFERENCES toc(id),
  position  INTEGER NOT NULL,
  title     TEXT NOT NULL
);
CREATE INDEX idx_toc_parent ON toc(parent_id, position);

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
"#;

/// Binary attachments: images and downloadable files referenced by pages as
/// `asset:<path>`. Present (possibly empty) in every `.khb`, and the sole content
/// table of a sidecar `.khba`. Kept separate from [`SCHEMA_SQL`] so the sidecar can
/// reuse just this table.
pub const ASSETS_SQL: &str = r#"
CREATE TABLE assets (
  path TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  data BLOB NOT NULL
);
"#;

/// The asset routing index, in every `.khb`: which store holds each asset path, so
/// resolution goes straight to the right file instead of probing every attachment
/// pack (essential once packs are streamed over HTTP). `pack` is `''` for an asset
/// embedded in this `.khb`, otherwise the owning sidecar's `meta.pack` id.
pub const ASSET_INDEX_SQL: &str = r#"
CREATE TABLE asset_index (
  path TEXT PRIMARY KEY,
  pack TEXT NOT NULL
);
"#;

/// Structural tables of a sidecar `.khba` attachments file: a `meta` table (so the
/// file can be validated and paired with its docset) plus the shared `assets` table.
pub const ATTACHMENTS_SCHEMA_SQL: &str = r#"
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE assets (
  path TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  data BLOB NOT NULL
);
"#;

/// The FTS5 tokenizer for a docset's language. English gets the Porter stemmer so
/// `fox` matches `foxes`; other languages fold diacritics without stemming (a safe
/// default until per-language stemmers are added). The returned value comes from a
/// fixed set, so it is safe to interpolate into DDL.
pub fn tokenizer_for_language(language: &str) -> &'static str {
    let primary = language
        .split(['-', '_'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    match primary.as_str() {
        "en" => "porter unicode61 remove_diacritics 2",
        _ => "unicode61 remove_diacritics 2",
    }
}

/// DDL that creates the external-content FTS5 index over `pages(title, plain, keywords)`.
pub fn create_fts_sql(tokenizer: &str) -> String {
    format!(
        "CREATE VIRTUAL TABLE pages_fts USING fts5(\
           title, plain, keywords, \
           content='pages', content_rowid='rowid', \
           tokenize='{tokenizer}');"
    )
}
