---
id: index
title: KD Help Book Internals
keywords: [internals, architecture, format, engine, reference, spec]
categories: [internals]
related: [file-formats, sqlite-schema, building-a-compiler, khb-authoring:index]
---

# KD Help Book Internals

This volume is for people who look **under** the viewer: viewer hackers, tooling
authors, and anyone writing a **third-party compiler** that produces `.khb` books
from a different source format. It explains how a book is stored, indexed, streamed,
sandboxed and described — the machinery the other two volumes take for granted.

If you *write* books, start with [Authoring KD Help Books](khb-authoring:index)
instead; if you *ship* them, see [Publishing KD Help Books](khb-publishing:index).
Come back here when you need to know what those tools actually produce.

> [!NOTE]
> These pages are a readable rendition, not the specification itself. The normative
> specs live in the repository: `docs/format.md` (file formats, schema, security)
> and `docs/streaming.md` (the Range-VFS design). Where they and this volume
> disagree, the spec files win.

## What's in this volume

| Page | Covers |
|------|--------|
| [File formats](file-formats) | `.khb`, `.khbb`, `.khba`, and the `.gz` transfer suffix |
| [SQLite schema](sqlite-schema) | every table, the `meta` keys, format versions v1–v6 |
| [Full-text search](full-text-search) | FTS5 external content, bm25, per-language tokenizers |
| [Streaming](streaming) | the Range-VFS: reading a remote book page-by-page |
| [Security model](security-model) | rendering untrusted books in a sandboxed frame |
| [Manifest schemas](manifest-schemas) | `docsets.json`, `config.json` and `.khbm`, field by field |
| [Building a compiler](building-a-compiler) | the checklist for producing valid `.khb` files yourself |

## The one idea everything follows from

A `.khb` book is an **ordinary SQLite database** with everything precomputed at
build time — rendered HTML, plain text, the TOC, the keyword index, the FTS index.
That single choice explains most of the architecture:

- **Any SQLite can open it** — the native Rust engine (CLI, Tauri), sql.js in the
  browser, or your own tooling.
- **Search is instant and offline** — nothing is computed at read time.
- **Streaming falls out for free** — SQLite reads fixed-size pages, and a page read
  maps one-to-one onto an HTTP `Range` request (see [Streaming](streaming)).
- **The format is source-agnostic** — the viewer renders stored HTML and never runs
  a Markdown engine, so any front end can produce a book (see
  [Building a compiler](building-a-compiler)).
