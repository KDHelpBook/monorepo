# kdhelp — guide for Claude Code

kdhelp is a documentation reader that recreates the look & feel of **Microsoft
Document Explorer** (MS Help 2.x / `dexplore.exe`), backed by a modern
toolchain. Content is compiled into a self-contained **`.khb`** docset (a SQLite
database) and rendered by a TypeScript viewer.

## Monorepo layout
- `compiler/` — Rust **Cargo workspace** (the native data engine):
  - `core/` — format/schema, `Docset` queries, SQLite + FTS5, Markdown render,
    `.khb` writer/reader, `.khbb` (postcard) codec, and a read-only **Range-VFS**
    (`vfs.rs`: `RangeReader` + `Docset::open_reader`) that streams only the pages a
    query touches — the native basis for HTTP streaming (`docs/streaming.md`).
    **Native only** (CLI + Tauri). No DOM.
  - `cli/` — the `kdhelp` CLI: `compile` / `convert` (`pack` / `patch` later).
  - `wasm/` — reserved (currently a stub). See the browser-SQLite note below.
  - `examples/{en,pl}/` — seed content compiled into the demo docsets.
- `viewer-ts/` — Vite + TypeScript viewer. In the **browser** it queries `.khb`
  with **sql.js** (SQLite compiled to wasm, in JS); on **Tauri** it will call the
  native Rust `core`.

## Browser SQLite (important)
`rusqlite`'s bundled C SQLite **cannot compile to browser wasm** (`wasm32-unknown-unknown`
has no libc). So the browser does **not** run the Rust engine: it uses **sql.js**
and mirrors `core`'s SQL. The Rust `core` remains the single engine for the **CLI
and Tauri** (native). Consequence: two query implementations (Rust native +
sql.js in the browser) — keep the SQL in sync with `compiler/core/src/docset.rs`.

Also: sql.js's default wasm build has **no FTS5**, so the prebuilt `pages_fts`
index is unusable in the browser build's default engine. The sql.js path searches
the stored `plain` column in JS instead (`viewer-ts/src/data/docset.ts`
`search()`); native/Tauri keep real FTS5 (bm25 + stemming).

Streaming engine (browser): `viewer-ts/src/data/streaming.ts` is an async Range VFS
on a **custom FTS5-enabled `wa-sqlite`** (SQLite 3.53 `-DSQLITE_ENABLE_FTS5`),
vendored under `viewer-ts/vendor/wa-sqlite/` with a reproducible Docker build recipe
(the *prebuilt* `wa-sqlite` ships without FTS5). It opens a remote `.khb` over HTTP
`Range` and reads only touched pages (~21 % of a 618 KB file to open + read a page),
with genuine bm25 FTS5 search over the streamed index. **It is wired into the live
viewer:** `StreamingDocset` (`streaming-docset.ts`) implements the shared **`IDocset`**
interface — structure (toc/categories/keywords/related) is eager-loaded at open and
served **synchronously**; only `page`/`asset`/`search` are **async** and stream on
demand. So `Docset`/`Collection`'s `page`/`asset`/`search` are async (structure stays
sync), and a streamed book merges into the same TOC/index/search as the sql.js books.
Opt-in via *File → Open from URL… → Stream*; the engine is **code-split** (loaded only
when a streamed docset opens), and `Collection.search` normalizes per-book scores so
FTS5 and the sql.js heuristic merge fairly. `wa-sqlite` 1.1 authors a VFS by extending
`FacadeVFS` (`jOpen`/`jRead`/…; `async` methods run via Asyncify — and
`SQLite.Factory(module)` must be called exactly once). See
[docs/streaming.md](docs/streaming.md). Native/Tauri already stream via
`compiler/core/src/vfs.rs`.
- `docs/` — `.khb` format spec + compiler manual.

The original single-file prototype (`help-viewer.html`) has been **removed** now
that the TypeScript viewer reached parity; it lives in git history (commit
`Initial`/`Baseline`) and `HANDOFF.md` documents it (Polish).

## Formats
- `.khb` — SQLite docset; the form queried at runtime.
- **`.gz` suffix** — any file (`.khb`/`.khba`/`.khbp`) gzip-compressed for transfer
  (`foo.khb.gz`); the viewer decompresses by gzip magic, not the name
  (`DecompressionStream('gzip')`). Replaced the former `.khbc` extension.
- `.khbb` — minimal binary (no indexes); rebuilt into `.khb` in-browser by wasm,
  cached in IndexedDB.
- `.khba` — sidecar SQLite file of attachments (images/downloads) for a `.khb`.
  Attachments may instead be **embedded** in the `.khb` (`assets` table, format v2);
  one `.khb` can have several `.khba` packs. Pages link assets as `asset:<path>`;
  the viewer resolves them to `data:` URLs (`compiler/core/src/assets.rs`). Resolution
  is routed by the `asset_index` table (path → pack; `''` = embedded, else a sidecar's
  `meta.pack` id) — one lookup, no probing — which is what makes streaming packs over
  HTTP viable later (`docs/streaming.md`).

## Security (untrusted docsets)
- Page bodies (`body_html`) are **untrusted** and rendered in a **sandboxed `<iframe>`**
  with `allow-scripts` but **without `allow-same-origin`** — origin isolation is the
  boundary: untrusted JS may run but can't reach the app (no parent DOM / localStorage
  / IndexedDB / chrome), and gets no other tokens (no popups/top-nav). A trusted
  **bridge** (`FRAME_BRIDGE` in `main.ts`) is the only channel: it `postMessage`s link
  clicks (with modifiers → new tab) + scroll; the app validates every message by
  source + shape (`open`/`ext`, safe-by-design). Assets inline as `data:`. The Search
  page (app UI) stays in the normal `#content` div. See `docs/format.md` §Security.

## Key decisions & conventions
- **Rust `core` is the engine for CLI + Tauri.** The browser mirrors its SQL via
  sql.js (see the browser-SQLite note above). Keep the two query paths in sync.
- Content is **source-format-agnostic**: `.khb` stores rendered HTML + plain
  text, never Markdown. The bundled compiler happens to take Markdown + frontmatter.
- **FTS5 external-content** (single copy of text) + `bm25()` + `snippet()`.
  Tokenizer per docset from `meta.language` (EN: `porter unicode61`;
  PL: `unicode61 remove_diacritics`).
- **Categories are a facet** (tags, many-to-many), independent of the TOC hierarchy.
- **"See also" (`related` frontmatter, `related` table)**: per-page curated links,
  each a local page id or a cross-book `docsetId:localId`; the viewer renders a
  footer and hides links to books that aren't loaded.
- **Multiple docsets merge into one** TOC/index/search (MS Help 2 collections);
  ids namespaced `docsetId:pageId`. Docsets group by `language`.
- **Families (`meta.collection`)**: books sharing a `collection` merge; several
  families each render as a top-level folder in the TOC (only when >1 family loaded).
  Index/search union across products, with a "Filter by product:" scope to narrow.
  Category filter prunes the tree (keeps structure), doesn't flatten it.
- **Streaming / online**: `core`'s Range-VFS (`Docset::open_reader`) + the CLI's
  `HttpRangeReader`/`kdhelp inspect <url>` stream a remote `.khb` page-by-page. The
  viewer has online/hybrid loading (*File → Open from URL…*, remotes persisted as URLs
  in localStorage, merged with bundled+uploaded) but still fetches a remote `.khb`
  **whole** — browser *page-level* streaming awaits an async-VFS SQLite-WASM engine
  swap (`docs/streaming.md` step 3).
- **i18n from the start** (EN default + PL): UI strings in locale files; content
  is one docset per language.
- **No single-file build.** Distribution: static multi-file (Pages) or Tauri.
  `pack` builds a publishable dist (viewer + docsets + `docsets.json`); `patch`
  updates one in place. Profiles: `reader` (external sources + PWA on) vs
  `bundled --lock` (embedded only, PWA off) — driven by `config.json`.
- **Visual fidelity to MS Document Explorer** (VS 2008 palette): faithful chrome,
  **no fake window titlebar** (that's system chrome), the **menu is fully
  functional**, and the toolbar has **only functional buttons** — no dummy
  controls anywhere.
- Code, comments, README, and this file are in **English**. `HANDOFF.md` stays
  Polish (historical).

## Layout gotchas that must survive the port (from HANDOFF §6)
- `min-width: 0` on flex panels — without it long `<pre>` lines blow out the layout.
- Single source of truth for the responsive breakpoint (CSS `@media` ↔ JS must
  agree). It's **compact = `(max-width: 640px), (max-height: 480px)`** — the height
  arm puts landscape phones (wide but short) on the drawer layout too; `COMPACT_MQ`
  in `main.ts` mirrors the two `@media` blocks. Touch (`pointer: coarse`) drives the
  touch affordances (folder single-tap, bigger targets, no hover-only auto-hide),
  independently of width.
- Full-viewport app shell via a `height: 100dvh` flex root (the old `position:fixed`
  hack is not needed in a real Vite app).

## Build & test
- Rust: `cd compiler && cargo test` (also `cargo clippy`, `cargo fmt`).
  CLI: `cargo run -p kdhelp-cli -- compile examples/en -o examples.en.khb`.
- Viewer: `cd viewer-ts && npm install && npm run dev|build|test|typecheck`
  (browser SQLite via sql.js — no wasm-pack needed).

## References
- The approved implementation plan lives in `~/.claude/plans/`.
- Original prototype behavior & gotchas: `HANDOFF.md`.
