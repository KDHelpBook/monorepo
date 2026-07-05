# kdhelp — guide for Claude Code

kdhelp is a documentation reader that recreates the look & feel of **Microsoft
Document Explorer** (MS Help 2.x / `dexplore.exe`), backed by a modern
toolchain. Content is compiled into a self-contained **`.khb`** docset (a SQLite
database) and rendered by a TypeScript viewer.

## Monorepo layout
- `compiler/` — Rust **Cargo workspace** (the native data engine):
  - `core/` — format/schema, `Docset` queries, SQLite + FTS5, Markdown render,
    `.khb` writer/reader, `.khbb` (postcard) codec. **Native only** (CLI + Tauri).
    No DOM.
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
index is unusable in the browser. The viewer searches the stored `plain` column
in JS instead (`viewer-ts/src/data/docset.ts` `search()`); native/Tauri keep real
FTS5 (bm25 + stemming). A future upgrade could swap in an FTS5-enabled SQLite-wasm.
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
  the viewer resolves them to blob URLs (`compiler/core/src/assets.rs`). Resolution
  is routed by the `asset_index` table (path → pack; `''` = embedded, else a sidecar's
  `meta.pack` id) — one lookup, no probing — which is what makes streaming packs over
  HTTP viable later (`docs/streaming.md`).

## Key decisions & conventions
- **Rust `core` is the engine for CLI + Tauri.** The browser mirrors its SQL via
  sql.js (see the browser-SQLite note above). Keep the two query paths in sync.
- Content is **source-format-agnostic**: `.khb` stores rendered HTML + plain
  text, never Markdown. The bundled compiler happens to take Markdown + frontmatter.
- **FTS5 external-content** (single copy of text) + `bm25()` + `snippet()`.
  Tokenizer per docset from `meta.language` (EN: `porter unicode61`;
  PL: `unicode61 remove_diacritics`).
- **Categories are a facet** (tags), independent of the TOC hierarchy.
- **Multiple docsets merge into one** TOC/index/search (MS Help 2 collections);
  ids namespaced `docsetId:pageId`. Docsets group by `language`.
- **Families (`meta.collection`)**: books sharing a `collection` merge; several
  families each render as a top-level folder in the TOC (only when >1 family loaded).
  Index/search union across products, with a "Filter by product:" scope to narrow.
  Category filter prunes the tree (keeps structure), doesn't flatten it.
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
- Single source of truth for the 640px breakpoint (CSS `@media` ↔ JS must agree).
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
