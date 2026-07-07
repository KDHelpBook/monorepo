---
title: What is a .khb docset?
keywords: [.khb, docset, SQLite, FTS5, format, .gz, .khbb, .khba, assets, attachments]
categories: [basics, reference]
related: [writing-pages, khb-extras-en:faq]
---
# What is a .khb docset?

A `.khb` file is an ordinary **SQLite** database that holds everything the viewer
needs, computed ahead of time:

![How a docset is built](assets/khb-pipeline.svg)

| Table | Purpose |
|-------|---------|
| `pages` | rendered HTML + plain text per page |
| `toc` | the table-of-contents tree |
| `categories`, `page_categories` | the category facet |
| `keywords` | the F1 keyword index |
| `pages_fts` | a full-text search index (FTS5) |
| `assets` | embedded images & downloadable attachments |

Because the index is prebuilt, search is instant and works offline.

## Transport variants

For delivery:

- **`.gz` suffix** — any file (`.khb`, `.khba`, …) can be gzip-compressed as
  `<name>.gz` and is decompressed in the browser.
- **`.khbb`** — a minimal binary with no indexes; the viewer rebuilds it into a
  `.khb` in the browser (via WebAssembly) and caches the result.

## Attachments

Images and downloadable files live in the `assets` table — either **embedded**
in the `.khb` or in one or more sidecar **`.khba`** files next to it. Either way
the bytes stay inside a self-contained SQLite container, so a docset still works
offline and when uploaded. For a one-page summary, download the
[quick-reference card](assets/quick-reference.txt).

The format is **independent of the source format**: `.khb` stores rendered HTML,
never Markdown, so a compiler for any input format can produce one.
