---
title: Building a compiler
keywords: [compiler, third-party, producer, checklist, validation, interoperability]
categories: [internals, format, engine]
related: [sqlite-schema, full-text-search, file-formats, khb-authoring:compiling]
---

# Building a compiler

A `.khb` is plain SQLite, so any tool that can create a SQLite database can
produce a valid book — from reStructuredText, AsciiDoc, DocBook, a wiki export,
anything. This page is the checklist. The bundled Markdown compiler
([khb compile](khb-authoring:compiling)) is one producer among possible many;
`docs/format.md` is the contract they all target.

## The checklist

1. **Create the schema tables** — every table on the
   [SQLite schema](sqlite-schema) page: `meta`, `pages`, `toc`, `categories`,
   `page_categories`, `keywords`, `related`, `products`, `assets` (may be empty)
   and `asset_index`. The DDL to copy is in `compiler/core/src/schema.rs`.
2. **Fill `meta`** — at minimum `format_version` (currently `1`), `docset_id`,
   `title`, `version`, `language`, `tokenizer` (the string you actually used —
   see step 5) and `generator` (name your tool). Set `collection` if the book
   should merge with siblings into one product family.
3. **Render HTML and plain text yourself.** The viewer runs **no** Markdown
   engine — `pages.body_html` is the canonical, final render, and `pages.plain`
   is the extracted plain text used for search and snippets. Whatever your source
   format, both must be produced at compile time. Two rendering rules worth
   copying from the bundled compiler: emit syntax highlighting as **CSS
   classes**, not inline colours — the viewer injects a theme stylesheet into
   the content frame, so class-tagged code follows the app theme (including
   dark mode) while hard-coded colours would not; and derive `plain`
   from an **unhighlighted** render, so per-token markup never leaks into
   full-text search.
4. **Optionally fill `pages.md`** with a clean Markdown rendition (nullable). The viewer ignores it; it feeds AI-facing surfaces such as the
   `llms.txt` export. Skip it if your source has no sensible Markdown form.
5. **Create the FTS index with the right tokenizer.** Emit the
   external-content `pages_fts` table (`content='pages'`) and pick the tokenizer
   from the language — `porter unicode61 remove_diacritics 2` for English,
   `unicode61 remove_diacritics 2` otherwise — then populate it (with external
   content, insert into `pages_fts(rowid, title, plain, keywords)` yourself or
   use the `rebuild` command). Details: [Full-text search](full-text-search).
6. **Reference binary files via the `asset:` scheme.** Rewrite image/link
   targets to `asset:<path>`, store the bytes in `assets` (embedded) or in
   `.khba` sidecars, and fill `asset_index` for **every** path — `''` for
   embedded, the sidecar's `meta.pack` id otherwise (see
   [File formats](file-formats)).
7. **Validate in-book links.** The viewer resolves a bare `page-id` link within
   the book and shows "not found" for a dangling one, so check at compile time
   that every in-book link, TOC `page_id` and in-book `related` target names an
   existing page. Cross-book ids (`docsetId:localId`) are stored as-is — the
   target book may not be loaded, and the viewer hides such links.
8. **Build the TOC** in `toc` with `parent_id`/`position`; use `page_id = NULL`
   for pure folder nodes. `VACUUM` the finished database.

## What you get for free

Do the above and the whole stack works without any extra effort:

- the book opens in the KD Help Book Viewer (upload, URL, or packed) and
  **merges** into collections by `meta.collection`;
- native and streamed search use your FTS index directly;
- **streaming included** — a valid `.khb` is streaming-ready as-is: the Range-VFS
  reads any well-formed SQLite file page-by-page, and `khb inspect <url>` is a
  quick way to prove yours streams;
- `khb pack` / `patch` will pick it up like any bundled book.

> [!TIP]
> Cheap conformance test: compile a book, then run `khb inspect my.khb` and open
> the file in the viewer next to a first-party docset. If metadata, TOC, index,
> search and images all behave, you have hit the contract.

> [!WARNING]
> Remember that whatever HTML you emit is rendered as **untrusted** content — the
> viewer sandboxes it regardless of who produced it (see the
> [Security model](security-model)). Don't rely on scripts reaching the app, and
> keep pages self-contained: external URLs won't be fetched; anything a page
> needs must be an `asset:`.
