# Streaming, online & hybrid modes

> **Status: streaming is proven on every tier — native, HTTP, and now the
> browser.** `compiler/core` has a read-only SQLite VFS (`vfs.rs`):
> `Docset::open_reader` streams only the pages a query touches (a 2 MB docset reads
> ~15 % for open + TOC + one page + one search), and the CLI's `kdhelp inspect
> <url>` reads a remote `.khb` over HTTP `Range`. The viewer has **online / hybrid**
> loading (*File → Open from URL…*, persisted remotes merged with bundled +
> uploaded). And the browser now has a working **async Range VFS**
> (`viewer-ts/src/data/streaming.ts`, on `wa-sqlite`): opening a remote `.khb` and
> reading one page by primary key fetches **~18 % of a 139 KB demo file**, mirroring
> the native win. Two honest caveats remain before it becomes the viewer's default
> engine: **(1)** the *prebuilt* `wa-sqlite` has **no FTS5**, so real in-browser
> full-text search still needs a custom Emscripten build (until then the viewer
> searches the stored `plain` column); **(2)** merging a *streamed* book into the
> live `Collection` means making the (currently synchronous, `sql.js`) data layer
> async — a trade deferred because it would make every *local* docset async for a
> benefit only large *remote* docsets receive. So the browser still fetches a remote
> `.khb` whole today; the streaming engine is built and measured, waiting behind that
> seam. Offline works throughout (bundled docsets + IndexedDB uploads + PWA).

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

## The Range-VFS loader

Streaming needs a **SQLite VFS over byte ranges**:

- **Native / Tauri — done.** `compiler/core/src/vfs.rs` is a read-only VFS written
  directly against `rusqlite::ffi` (the same bundled SQLite the engine uses, so no
  "two SQLite libraries" clash). It treats the file as **immutable** (writes/locks
  are no-ops; the device reports `IMMUTABLE`, so no journal/WAL), coalesces reads
  into 64 KiB cached blocks, and drives everything through a small trait:

  ```rust
  pub trait RangeReader: Send + Sync {
      fn size(&self) -> u64;
      fn read_at(&self, offset: u64, buf: &mut [u8]) -> anyhow::Result<()>;
  }
  Docset::open_reader(reader: Arc<dyn RangeReader>) -> Docset  // queries stream
  ```

  A `FileRangeReader` ships for local/streaming use and tests. The **HTTP reader**
  lives in the CLI (`kdhelp-cli`'s `HttpRangeReader`, a ~30-line `ureq` impl:
  `read_at` → `GET` with a `Range:` header; `size` from `Content-Range`) — kept out
  of `core`'s dependencies so each consumer picks its own client.
  **`kdhelp inspect <url>`** opens a remote `.khb` this way; e.g. it reads a docset's
  full metadata by fetching ~1×64 KiB block, and a 2 MB docset streams ~15 % for
  open + TOC + one page + one search.
- **Browser — built and measured.** `viewer-ts/src/data/streaming.ts` implements an
  **async Range VFS** on [`wa-sqlite`](https://github.com/rhashimoto/wa-sqlite)
  (its Asyncify build lets a VFS method `await` a `fetch(url, {headers:{Range}})`).
  `RangeVFS` treats the file as immutable (writes/locks are no-ops; it reports
  `IMMUTABLE`), coalesces reads into cached blocks (64 KiB default; tunable down to
  one 4 KiB page), and `streamProbe(url)` opens a remote `.khb`, reads its metadata
  and one page **by primary key**, and reports the bytes fetched. On the 139 KB demo
  docset that is **~2.9 % to open + parse the schema** and **~18 % to also read a
  full page** — the browser mirror of the native VFS's 15 %-of-2 MB.

  Two things keep this from being the viewer's *default* engine yet:
  - **No FTS5 in the prebuilt binary.** `wa-sqlite`'s shipped wasm is built without
    FTS5, so it would *not* by itself restore real in-browser full-text search — that
    needs a custom Emscripten build (`-DSQLITE_ENABLE_FTS5`). Until then the viewer
    keeps searching the stored `plain` column (see [format.md](format.md)).
  - **Sync → async cascade.** `sql.js` is synchronous and the whole data layer
    (`Docset`/`Collection`) and its call sites are written against that; `wa-sqlite`'s
    async VFS is asynchronous. Merging a streamed book into the live collection means
    making that layer async everywhere — which also makes every *local* docset async,
    for a benefit only large *remote* docsets get. So the engine is kept as a proven,
    self-contained module behind the source seam rather than swapped in wholesale.

## Wiring it into the existing seams

The viewer already abstracts *where a docset comes from*. Streaming is a **third
source kind**, not a rewrite:

```ts
// viewer-ts/src/data/collection.ts — today:
type DocsetSource =
  | { bytes: Uint8Array }   // upload / IndexedDB
  | { file: string };       // fetch (a `.gz` name is decompressed after fetch)
// planned add:
  | { url: string; mode: "streaming" };   // opened via Range-VFS, pages on demand
```

- `Collection` already merges N books into one TOC / index / search / category
  facet regardless of source — so a `streaming` docset slots in beside fetched and
  uploaded ones. (Compression is orthogonal: a `.gz` file is decompressed on fetch;
  a streamed docset is served uncompressed so `Range` requests address raw pages.)
- `config.json` profiles (`reader` vs `bundled --lock`) already gate whether
  external/remote sources are allowed.
- Attachment packs (`.khba`) can likewise be local files or remote URLs; `asset_index`
  already names the owning pack, so the resolver just fetches from the right place.

**Online / hybrid is shipped (browser fetches whole).** *File → Open from URL…* adds a
remote docset by URL; it is persisted (as a URL, re-fetched each session — the "online"
part) and merged with bundled + uploaded docsets into one collection, so you can mix a
product's own docs with remote ones. The only thing still whole-file is the *transport*
in the browser: a remote `.khb` is fetched entirely before opening, because browser
**page-level** streaming needs the async-VFS engine below. Natively (`kdhelp inspect
<url>`, Tauri) the same remote docset already streams page-by-page through the Range-VFS.

## Content packs — splitting page bodies out of the `.khb`

Attachments already move the bulky *binary* payload into sidecars. The same idea
generalises to **page content**: keep a small navigable/searchable skeleton in the
main `.khb` and stream the heavy rendered HTML on demand.

The split falls out of one fact: **`plain` (the searchable text) is a separate column
from `body_html` (the rendered page).** So the master `.khb` can keep everything
needed to browse and search — `title` + `plain` + `keywords` + `toc` + `categories` +
the FTS5 index — plus routing tables, while each **content pack** carries the
`body_html` rows (and assets). Concretely:

| Lives in the master `.khb` | Lives in a content pack |
|----------------------------|-------------------------|
| `meta`, `toc`, `categories`, `keywords`, `pages(id, title, plain, keywords)`, `pages_fts` | `pages(id, body_html)` for its slice, and/or `assets` |
| `page_index(page_id → pack)`, `asset_index(path → pack)` | — |

- **Search, index, TOC, snippets work fully offline** from the (small) master file —
  `snippet()` already draws from `plain`, not `body_html`.
- **Opening a page** looks up `page_index` (exactly like `asset_index`), then reads
  `body_html` from the one routed pack — one lookup, one ranged read, no probing.
- Routing is by the pack's stable `meta.pack` id, so packs are order-independent
  (same property that makes re-uploaded attachment packs resolve correctly).

This is the symmetric extension of what already ships: `Docset.asset(path)` routes via
`asset_index`; a future `Docset.page(id)` would route its `body_html` via `page_index`
the same way, and `Collection` merges packs as it already merges books.

**Naming.** A content pack is just a `.khb`-shaped SQLite file carrying a *subset* of
tables — a `.khba` is the degenerate "assets-only" case. Proposed: **`.khbp`**
("pack") for a general content pack, with `.khba` kept (or folded in) as the
assets-only shorthand. Like every file, a pack can be shipped compressed with a
`.gz` suffix (`foo.khbp.gz`). The master `.khb`'s `page_index`/`asset_index` name the
owning pack by its `meta.pack`.

**When to use which.** For purely **offline** modularity — a base product plus
optional expansion books — you don't need any of this: ship several complete `.khb`
files and let **collections** merge them (that works today). Content packs earn their
keep only alongside streaming, where the point is a tiny initial download with page
bodies fetched lazily.

## Tauri: streamed assets & media in the webview

For the desktop app, stream bytes to the webview through a **custom URI scheme**
(`register_uri_scheme_protocol`, e.g. `khb-asset://<docset>/<path>`) handled in Rust:

- the handler resolves the pack via `asset_index`, then reads from the embedded
  table, a local `.khba`, or a remote one over Range-VFS;
- it honours the request's `Range` header, so `<video>`/`<audio>` seek and large
  downloads stream instead of being inlined whole as a `data:` URL (which is what the
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

1. A Range-VFS SQLite loader. **✅ Native + HTTP done** (`core/src/vfs.rs` +
   `Docset::open_reader`; the CLI's `HttpRangeReader` + `kdhelp inspect <url>`).
2. Remote docsets in the viewer. **✅ Done** — *File → Open from URL…* + persisted
   remotes, merged into the collection (online / hybrid). The browser still fetches a
   remote `.khb` **whole** (page-level streaming waits on step 3).
3. **Browser page-level streaming.** **✅ Engine built & measured** —
   `viewer-ts/src/data/streaming.ts` is an async Range VFS on `wa-sqlite` that opens a
   remote `.khb` over `Range` and reads only touched pages (~18 % of a 139 KB file to
   open + read a page; verified against Vite's dev server, which serves `206`). **Two
   follow-ups remain before it replaces `sql.js` as the default:** (a) a custom
   Emscripten `wa-sqlite` build *with FTS5* to restore real in-browser full-text
   search (the prebuilt binary has none); (b) making `Docset`/`Collection` and their
   call sites async so a streamed book merges into the live collection — deferred
   because it makes the common *local* path async for a *remote*-only benefit. Until
   then the browser fetches a remote `.khb` whole (step 2) and the streaming engine
   waits behind the source seam.
4. Tauri `khb-asset://` protocol with `Range` support for streamed media.
5. **Content packs** — a `page_index` table + a compiler `--split` that peels
   `body_html` (and assets) into `.khbp` packs, and a `Docset.page(id)` that routes
   through it. Optional; only worthwhile once step 3 exists.

Steps 1–4 change **no** format — the files shipped today are already streaming-ready.
Step 5 adds one routing table (`page_index`) mirroring `asset_index`; the master
`.khb` and the packs stay ordinary SQLite.
