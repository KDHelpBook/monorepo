# Streaming, online & hybrid modes

> **Status: streaming is proven on every tier — native, HTTP, and now the
> browser.** `compiler/core` has a read-only SQLite VFS (`vfs.rs`):
> `Docset::open_reader` streams only the pages a query touches (a 2 MB docset reads
> ~15 % for open + TOC + one page + one search), and the CLI's `khb inspect
> <url>` reads a remote `.khb` over HTTP `Range`. The viewer has **online / hybrid**
> loading (*File → Open from URL…*, persisted remotes merged with bundled +
> uploaded). And the browser now **streams too**: *File → Open from URL…* has a
> **"Stream (don't download the whole file)"** option that opens a remote `.khb`
> page-by-page over HTTP `Range` and **merges it into the live collection** — one
> TOC / index / search alongside the whole-file books. A streamed book fetches
> **~18–21 % of a demo file** (139 KB / 618 KB) to open + read a page, mirroring the
> native win, and runs **real, bm25-ranked FTS5** over the streamed index via a
> **custom FTS5-enabled `wa-sqlite` build** vendored under `viewer-ts/vendor/wa-sqlite/`
> (the prebuilt `wa-sqlite` has no FTS5). The engine is **code-split**, so sessions
> without a streamed docset never load it. Whole-file remains the default (and only
> option for a non-Range host); offline works throughout (bundled + IndexedDB uploads
> + PWA).

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
  lives in the CLI (`khb-cli`'s `HttpRangeReader`, a ~30-line `ureq` impl:
  `read_at` → `GET` with a `Range:` header; `size` from `Content-Range`) — kept out
  of `core`'s dependencies so each consumer picks its own client.
  **`khb inspect <url>`** opens a remote `.khb` this way; e.g. it reads a docset's
  full metadata by fetching ~1×64 KiB block, and a 2 MB docset streams ~15 % for
  open + TOC + one page + one search.
- **Browser — built and measured (with FTS5).** `viewer-ts/src/data/streaming.ts`
  implements an **async Range VFS** on
  [`wa-sqlite`](https://github.com/rhashimoto/wa-sqlite) (its Asyncify build lets a
  VFS method `await` a `fetch(url, {headers:{Range}})`). In wa-sqlite 1.1 the VFS is
  authored by extending `FacadeVFS` with `jOpen`/`jRead`/… methods; the `async` ones
  are suspended/resumed through Asyncify automatically. `RangeVFS` treats the file as
  immutable (writes rejected; it reports `IMMUTABLE`), coalesces reads into cached
  blocks (64 KiB default; tunable to one 4 KiB page), and `streamProbe(url)` opens a
  remote `.khb`, reads metadata + one page **by primary key**, and runs a real FTS5
  `MATCH`, reporting the bytes fetched at each step. On the 618 KB demo docset that is
  **~10.6 % to open**, **~21 % to also read a full page**, and **~32 % to also run a
  bm25 search** — the browser mirror of the native VFS's 15 %-of-2 MB.

  **Real FTS5 in the browser.** The engine is a **custom `wa-sqlite` build with
  FTS5** (SQLite 3.53, `-DSQLITE_ENABLE_FTS5`), vendored under
  `viewer-ts/vendor/wa-sqlite/` with a reproducible build recipe — because the
  *prebuilt* `wa-sqlite` ships without FTS5 (`MATCH` → *"no such module: fts5"*). So a
  docset gets genuine bm25-ranked full-text search.

  > **Update:** sql.js has since been **retired**. This one wa-sqlite engine now backs
  > **every** browser book — whole-file (bundled/uploaded) via an in-memory `BlockReader`
  > and remote via HTTP Range — so whole-file books get the same real FTS5, not the old
  > JS `plain`-column heuristic. The "sql.js" mentions below are historical.

  **Merged into the live collection.** `StreamingDocset` (`streaming-docset.ts`) is the
  sole browser `IDocset` engine: it **eager-loads the small structure** at open
  (toc/categories/keywords/related — sync thereafter) and reads the **heavy parts**
  (`page`/`asset`/`search`) on demand — streamed over Range, or from memory for a
  whole-file book. That split kept the sync→async change small: only
  `page`/`asset`/`search` are async across `Docset`/`Collection` and their call sites;
  structure stays synchronous. The engine is **code-split** (one chunk, loaded on the
  first docset open), and `Collection.search` **normalizes each book's bm25 scores**
  before merging so books interleave fairly instead of one crowding out the others.

## Wiring it into the existing seams

The viewer already abstracts *where a docset comes from*. Streaming is a **third
source kind**, not a rewrite:

```ts
// viewer-ts/src/data/collection.ts — today:
type DocsetSource =
  | { bytes: Uint8Array }                  // upload / IndexedDB
  | { file: string }                       // fetch whole (`.gz` decompressed after)
  | { url: string; mode: "streaming" };    // Range-VFS, pages on demand (wa-sqlite)
```

- `Collection` already merges N books into one TOC / index / search / category
  facet regardless of source — so a `streaming` docset slots in beside fetched and
  uploaded ones. (Compression is orthogonal: a `.gz` file is decompressed on fetch;
  a streamed docset is served uncompressed so `Range` requests address raw pages.)
- `config.json` profiles (`reader` vs `bundled --lock`) already gate whether
  external/remote sources are allowed.
- Attachment packs (`.khba`) can likewise be local files or remote URLs; `asset_index`
  already names the owning pack, so the resolver just fetches from the right place.

**Online / hybrid is shipped — whole-file *and* page-level.** *File → Open from URL…*
adds a remote docset by URL; it is persisted (as a URL, re-fetched each session — the
"online" part) and merged with bundled + uploaded docsets into one collection, so you
can mix a product's own docs with remote ones. Its **"Stream"** checkbox chooses the
transport: unchecked fetches the `.khb` whole (works on any CORS host); checked opens
it **page-by-page over `Range`** through the browser async-VFS engine — the same
page-level streaming that `khb inspect <url>` / Tauri do natively.

**Bundled books can stream too.** A `docsets.json` entry may carry
`"streaming": true` (written by `khb pack`/`patch` `--stream`): the viewer then
opens that bundled book page-by-page over `Range` from the site's own `docsets/`
folder instead of downloading it whole — including in a locked `bundled --lock`
build, which never reaches the remote-sources path. The negotiation mirrors a
streamed remote: probe the host with a 1-byte `Range` request, validate with a cheap
streamed peek, and on any failure fall back silently to the whole fetch, so a
non-Range host (or a proxy that strips the header) costs nothing. Since `Range`
addresses raw SQLite pages, `--stream` keeps the marked docset and its packs
uncompressed even under `--mode compact` (the viewer ignores the flag on `.gz`
entries), and the service worker passes `Range` requests straight to the network —
the Cache API can't hold partial responses, so a streamed book is online-only rather
than part of the offline PWA cache. Streaming pays off for **big single books**
(the viewer already loads only the picked language/version variant, so many small
books gain nothing from it).

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

## Online / hybrid (the classic help-viewer model)

A classic desktop help viewer could run local-only, online, or "local first, then online".
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
   `Docset::open_reader`; the CLI's `HttpRangeReader` + `khb inspect <url>`).
2. Remote docsets in the viewer. **✅ Done** — *File → Open from URL…* + persisted
   remotes, merged into the collection (online / hybrid). Whole-file fetch is the
   default transport here; the **Stream** checkbox opts into page-level streaming
   (step 3).
3. **Browser page-level streaming.** **✅ Built, wired in & verified, with FTS5.**
   `viewer-ts/src/data/streaming.ts` is an async Range VFS on a **custom FTS5-enabled
   `wa-sqlite`** (vendored under `viewer-ts/vendor/wa-sqlite/`); `StreamingDocset`
   (`streaming-docset.ts`) implements the shared `IDocset` — **eager-loading the small
   structure** (toc/categories/keywords/related) at open and **streaming the heavy
   parts on demand** (page bodies, assets — embedded *or* from a streamed `.khba`
   sidecar routed by `asset_index` — and FTS5 search). The data layer went
   async where it matters (`Docset`/`Collection` `page`/`asset`/`search`; structure
   stays sync), so a streamed book **merges into the live collection** — verified: it
   appears as its own family folder, its pages + graphics stream on click (~21 % of a
   618 KB file to open + read a page), and its bm25 FTS5 hits interleave with the
   other books (per-book score normalization keeps the merge fair). Opt-in via *File →
   Open from URL… → Stream* for remotes, or `"streaming": true` in `docsets.json`
   (`khb pack --stream`) for bundled books; the engine is code-split so
   non-streaming sessions never load it. Whole-file (step 2) stays the default and
   the fallback for non-Range hosts.
4. Tauri `khb-asset://` protocol with `Range` support for streamed media.
5. **Content packs** — a `page_index` table + a compiler `--split` that peels
   `body_html` (and assets) into `.khbp` packs, and a `Docset.page(id)` that routes
   through it. Optional; only worthwhile once step 3 exists.

Steps 1–4 change **no** format — the files shipped today are already streaming-ready.
Step 5 adds one routing table (`page_index`) mirroring `asset_index`; the master
`.khb` and the packs stay ordinary SQLite.
