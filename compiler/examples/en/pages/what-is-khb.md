---
title: What is a .khb docset?
keywords: [.khb, docset, SQLite, FTS5, format, .khbc, .khbb]
categories: [basics, reference]
---
# What is a .khb docset?

A `.khb` file is an ordinary **SQLite** database that holds everything the viewer
needs, computed ahead of time:

| Table | Purpose |
|-------|---------|
| `pages` | rendered HTML + plain text per page |
| `toc` | the table-of-contents tree |
| `categories`, `page_categories` | the category facet |
| `keywords` | the F1 keyword index |
| `pages_fts` | a full-text search index (FTS5) |

Because the index is prebuilt, search is instant and works offline.

## Transport variants

Two smaller variants exist for delivery:

- **`.khbc`** — a gzip-compressed `.khb`, decompressed in the browser.
- **`.khbb`** — a minimal binary with no indexes; the viewer rebuilds it into a
  `.khb` in the browser (via WebAssembly) and caches the result.

The format is **independent of the source format**: `.khb` stores rendered HTML,
never Markdown, so a compiler for any input format can produce one.
