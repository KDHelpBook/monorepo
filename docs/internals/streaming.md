---
title: Streaming
keywords: [streaming, Range, VFS, wa-sqlite, Asyncify, HTTP, page-level]
categories: [internals, engine]
related: [file-formats, khb-publishing:pack-stream, khb-publishing:hosting]
---

# Streaming

A `.khb` can be read **page-by-page over HTTP `Range`** — open a remote book,
browse its TOC, read a page and run a real full-text search while fetching only a
fraction of the file. `docs/streaming.md` in the repository is the normative
design document; this page explains how it works and what a host must provide.

## Why SQLite makes it possible

A `.khb` is SQLite with a fixed **4096-byte page size**, and every read SQLite
performs is "give me page N" — which maps one-to-one onto an HTTP `Range:`
request. A static file server is therefore enough to serve *only the pages a query
touches*: a search hits the FTS/B-tree pages it needs, opening a page reads its
row's overflow pages, and nothing else is downloaded. (A zip archive is not
page-addressable this way; choosing SQLite is what kept this door open.)

Attachments compound the win: the `asset_index` routing table resolves an
`asset:<path>` with one lookup → one ranged read of the *one* `.khba` pack that
holds it, never a probe across every pack.

## The Range-VFS design

Streaming is a **SQLite VFS over byte ranges**, implemented twice — natively and
in the browser — with the same shape:

- **Immutable, read-only.** Writes and locks are no-ops and the device reports
  `IMMUTABLE`, so SQLite never wants a journal or WAL. A streamed file must never
  change in place (publish a new file instead).
- **Block-coalesced reads.** Individual page reads are coalesced into aligned
  **64 KiB cached blocks**, so chatty small reads become a few larger fetches.
- **A minimal reader interface.** All I/O funnels through one trait:

```rust [compiler/core/src/vfs.rs]
pub trait RangeReader: Send + Sync {
    fn size(&self) -> u64;
    fn read_at(&self, offset: u64, buf: &mut [u8]) -> anyhow::Result<()>;
}
```

### Native (CLI / Tauri)

`compiler/core/src/vfs.rs` registers the VFS directly against `rusqlite::ffi` —
the same bundled SQLite the rest of the engine uses, avoiding the "two SQLite
libraries" clash — and `Docset::open_reader(reader)` makes every existing query
stream. The HTTP reader lives in the CLI (`HttpRangeReader`: `read_at` becomes a
`GET` with a `Range:` header, `size` comes from `Content-Range`), kept out of
`core` so each consumer picks its own HTTP client. `khb inspect <url>` opens a
remote book this way; a 2 MB docset streams roughly **15 %** of its bytes for open
+ TOC + one page + one search.

### Browser (wa-sqlite + Asyncify)

sql.js cannot `await` inside a read callback, so the browser streaming engine is
built on **wa-sqlite**, whose Asyncify build lets a VFS method `await
fetch(url, {headers: {Range: …}})`. `viewer-ts/src/data/streaming.ts` implements
the async Range VFS (same immutability and block cache); `StreamingDocset` wraps
it as a regular docset that **eager-loads the small structure** (TOC, categories,
keywords, related) at open and **streams the heavy parts** (page bodies, assets,
search) on demand, so a streamed book merges into the same TOC/index/search as
whole-file books.

Two practical notes:

- The prebuilt `wa-sqlite` ships **without FTS5**, so the viewer vendors a
  **custom FTS5-enabled build** (SQLite 3.53, `-DSQLITE_ENABLE_FTS5`) under
  `viewer-ts/vendor/wa-sqlite/` — streamed books get genuine bm25 search, unlike
  the sql.js fallback (see [Full-text search](full-text-search)).
- The engine is **code-split**: sessions that never open a streamed docset never
  download it.

Measured on a 618 KB demo docset: **~11 %** of the file to open, **~21 %** to also
read a full page, **~32 %** to also run a bm25 search.

## What a host must provide

| Requirement | Why |
|-------------|-----|
| HTTP `Range` support (`206 Partial Content`) | every SQLite page read is a ranged `GET` |
| The streamed file served **raw** — no gzip, no `.gz` | `Range` offsets must address raw SQLite pages |
| CORS allowing the viewer's origin (for remote books) | the browser fetches cross-origin |
| A file that never changes in place | the VFS treats it as immutable and caches blocks |

> [!NOTE]
> Streaming is a preference, not a promise. The viewer probes the host with a
> cheap `Range` request and validates with a streamed peek; on any failure it
> falls back silently to fetching the whole file — so a non-Range host (or a proxy
> that strips the header) costs nothing but the fallback. Because the Cache API
> can't hold partial responses, a streamed book is online-only rather than part of
> the offline PWA cache.

How to *mark* a published book for streaming (`khb pack --stream`, the
uncompressed-under-compact rule, when it pays off) is covered in
[pack --stream](khb-publishing:pack-stream) and [Hosting](khb-publishing:hosting).
