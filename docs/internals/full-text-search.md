---
title: Full-text search
keywords: [FTS5, bm25, snippet, tokenizer, porter, stemming, sql.js]
categories: [internals, engine]
related: [sqlite-schema, streaming, khb-authoring:frontmatter-keywords]
---

# Full-text search

Search over a `.khb` is a single SQLite **FTS5** query — built at compile time,
ranked with `bm25()`, highlighted with `snippet()`. `docs/format.md` is the
normative spec; this page explains the design.

## External content: the text is stored once

The FTS index is created as an **external-content** table over
`pages(title, plain, keywords)`:

```sql
CREATE VIRTUAL TABLE pages_fts USING fts5(
  title, plain, keywords,
  content='pages', content_rowid='rowid',
  tokenize='<tokenizer>'
);
```

With `content='pages'`, the virtual table holds **only the inverted index** and
reads the text itself from the `pages` table when needed. The searchable text
(`plain`) therefore exists exactly once in the file — no second copy bloating the
docset — and `snippet()` draws from that same column.

## The query

```sql
SELECT p.id, p.title,
       snippet(pages_fts, 1, '<mark>', '</mark>', '…', 12) AS snip,
       -bm25(pages_fts) AS score
FROM pages_fts JOIN pages p ON p.rowid = pages_fts.rowid
WHERE pages_fts MATCH ?
ORDER BY score DESC;
```

`bm25()` returns *lower-is-better* values, hence the negation to sort a
higher-is-better `score`. `snippet()` picks the best 12-token window from `plain`
(column 1) and wraps the matched terms.

## Per-language tokenizers

The tokenizer is chosen from `meta.language` at build time (the mapping lives in
`tokenizer_for_language` in `compiler/core/src/schema.rs`) and recorded in
`meta.tokenizer`:

| Language | Tokenizer |
|----------|-----------|
| `en` | `porter unicode61 remove_diacritics 2` — English stemming, so *fox* matches *foxes* |
| any other | `unicode61 remove_diacritics 2` — diacritics folded, no stemmer |

Only the primary subtag matters (`en-US` → `en`), and the returned value comes
from a fixed set, so it is safe to interpolate into the DDL. Folding diacritics
without stemming is the safe default for other languages until per-language
stemmers are added — for Polish, `wyjątek` still matches `wyjatek`.

This is also why content ships as **one docset per language**: each book gets an
index tokenized for its own language.

## Where each engine differs

The same file is searched by three engines, and they are not equal:

| Engine | Where | Search |
|--------|-------|--------|
| Rust `core` (rusqlite) | CLI, Tauri | real FTS5: bm25 + stemming |
| sql.js | browser, whole-file books | **no FTS5** — JS scan over `plain` |
| custom wa-sqlite | browser, streamed books | real FTS5: bm25 + stemming |

> [!WARNING]
> The stock `sql.js` wasm build ships **without FTS5**, so the prebuilt
> `pages_fts` index is unusable in the browser's default engine. For whole-file
> books the viewer instead searches the stored `plain` column in JS — a heuristic,
> not bm25. The index in the file is *not* wasted, though: native (CLI/Tauri) uses
> it directly, and so does the browser's **streaming** engine, a custom
> FTS5-enabled `wa-sqlite` build (see [Streaming](streaming)).

When books on different engines merge into one collection, the viewer normalizes
each book's scores before interleaving results, so bm25 values and the sql.js
heuristic compete fairly.

Keyword terms (from page frontmatter — see
[keywords](khb-authoring:frontmatter-keywords)) take part in full-text matching via
the space-joined `pages.keywords` column, *and* feed the separate structured
`keywords` table that drives the F1 index.
