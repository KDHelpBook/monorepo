# Streaming, online & hybrid modes (planned)

> **Status: design, not yet built.** The current browser path (`sql.js`) loads each
> `.khb`/`.khba` **fully** into memory, and offline works today (bundled docsets +
> IndexedDB uploads + the PWA cache). This document describes the architecture the
> format was chosen for — how the same page-aligned SQLite files can later be
> **streamed** over HTTP and mixed **online + offline** — and which seams already
> exist so it drops in without a rewrite.

## Why SQLite makes this possible

A `.khb`/`.khba` is a SQLite database with a fixed **`page_size` (4096)**. Every
read SQLite performs is "give me page N" — which maps one-to-one onto an HTTP
`Range:` request. So a static file server is enough to serve *only the pages a query
touches*: a search hits the FTS/B-tree pages it needs, opening a page reads its row's
overflow pages, and nothing else is downloaded. A zip is not page-addressable this
way; choosing SQLite is what keeps the streaming door open (and keeps one engine for
CLI, Tauri and browser — see [format.md](format.md)).

Attachments compound the win: with the **`asset_index`** routing table, resolving an
`asset:<path>` is one lookup → one ranged read of the *one* pack that holds it, never
a probe across every `.khba`. Routing is by the sidecar's stable `meta.pack` id, so
order/placement of packs never matters.

## The one missing piece: a Range-VFS loader

Everything else is in place; streaming needs a **SQLite VFS over HTTP Range**:

- **Browser.** An FTS5-capable, VFS-enabled SQLite-WASM build (e.g. the official
  `sqlite-wasm`, or `sql.js-httpvfs`) opens a URL as a database, fetching pages via
  `Range` and caching them. This would also restore *real* FTS5 in the browser
  (today the viewer searches the stored `plain` column because stock `sql.js` has no
  FTS5 — see [format.md](format.md)).
- **Native / Tauri.** A Rust VFS in `compiler/core` backed by an HTTP client (the
  spike the plan calls out). Natively this is easier than in the browser — real
  threads, no CORS/wasm limits — and local files already read lazily from disk, with
  incremental BLOB I/O (`sqlite3_blob_read`) for large attachments.

## Wiring it into the existing seams

The viewer already abstracts *where a docset comes from*. Streaming is a **third
source kind**, not a rewrite:

```ts
// viewer-ts/src/data/collection.ts — today:
type DocsetSource =
  | { bytes: Uint8Array }            // upload / IndexedDB
  | { file: string; mode?: string }; // fetch (khb / compact)
// planned add:
  | { url: string; mode: "streaming" };   // opened via Range-VFS, pages on demand
```

- `Collection` already merges N books into one TOC / index / search / category
  facet regardless of source, and `docsets.json` already carries a per-docset `mode`
  — so a `streaming` docset slots in beside `khb`/`compact` ones.
- `config.json` profiles (`reader` vs `bundled --lock`) already gate whether
  external/remote sources are allowed.
- Attachment packs (`.khba`) can likewise be local files or remote URLs; `asset_index`
  already names the owning pack, so the resolver just fetches from the right place.

## Tauri: streamed assets & media in the webview

For the desktop app, stream bytes to the webview through a **custom URI scheme**
(`register_uri_scheme_protocol`, e.g. `khb-asset://<docset>/<path>`) handled in Rust:

- the handler resolves the pack via `asset_index`, then reads from the embedded
  table, a local `.khba`, or a remote one over Range-VFS;
- it honours the request's `Range` header, so `<video>`/`<audio>` seek and large
  downloads stream instead of being buffered whole into a blob URL (which is what the
  browser build does today for simplicity).

## Online / hybrid (the MS Help model)

MS Document Explorer could run local-only, online, or "local first, then online".
The same three modes fall out of the seams above:

| Mode | How |
|------|-----|
| **Offline** | bundled docsets + uploaded ones (IndexedDB) + PWA runtime cache — **works today** |
| **Online** | docsets/packs served from a host, opened via Range-VFS on demand |
| **Hybrid** | one merged collection mixing local and streamed books; per asset, `asset_index` points at a local or a remote pack, so an image is taken from cache offline and streamed online |

Search across a hybrid collection is unchanged: `Collection` merges ranked results
per book, whether a book is in memory or streamed (native FTS5 over Range-VFS, or a
small fully-fetched index for a remote book).

## Summary of what to build, in order

1. A Range-VFS SQLite loader (native first — easiest — then an FTS5+VFS SQLite-WASM
   in the browser). Fallback already documented: `sql.js-httpvfs`.
2. A `{ url, mode: "streaming" }` `DocsetSource` + `streaming` in `docsets.json`;
   attachment packs likewise addressable by URL.
3. Tauri `khb-asset://` protocol with `Range` support for streamed media.

None of these change the `.khb`/`.khba` format — the files shipped today are already
streaming-ready.
