# kdhelp — guide for Claude Code

kdhelp is a documentation reader that recreates the look & feel of **Microsoft
Document Explorer** (MS Help 2.x / `dexplore.exe`), backed by a modern
toolchain. Content is compiled into a self-contained **`.khb`** docset (a SQLite
database) and rendered by a TypeScript viewer.

## Monorepo layout
- `compiler/` — Rust **Cargo workspace** (the data engine):
  - `core/` — format/schema, `Docset`/`Collection` queries, SQLite + FTS5,
    HTTP-Range VFS (streaming), `.khbb` binary converter. Compiles to **native**
    (CLI/Tauri) *and* **wasm** (browser). No DOM.
  - `cli/` — the `kdhelp` CLI: `compile` / `pack` / `patch` / `convert`.
  - `wasm/` — wasm-bindgen bindings exposing `core` to the browser (`wasm-pack`).
  - `examples/{en,pl}/` — seed content compiled into the demo docsets.
- `viewer-ts/` — Vite + TypeScript viewer: **UI only** + a thin binding to `core`.
- `docs/` — `.khb` format spec + compiler manual.
- `help-viewer.html` — original single-file prototype, the **reference to port
  from** (removed once parity is verified). `HANDOFF.md` documents it (Polish).

## Formats
- `.khb` — SQLite docset; the form queried at runtime.
- `.khbc` — gzip-compressed `.khb` (transfer; `DecompressionStream('gzip')`).
- `.khbb` — minimal binary (no indexes); rebuilt into `.khb` in-browser by wasm,
  cached in IndexedDB.

## Key decisions & conventions
- **One data engine in Rust** shared by CLI, browser (wasm), and Tauri. The TS
  side is UI + a thin binding — keep logic in `core`, not in TypeScript.
- Content is **source-format-agnostic**: `.khb` stores rendered HTML + plain
  text, never Markdown. The bundled compiler happens to take Markdown + frontmatter.
- **FTS5 external-content** (single copy of text) + `bm25()` + `snippet()`.
  Tokenizer per docset from `meta.language` (EN: `porter unicode61`;
  PL: `unicode61 remove_diacritics`).
- **Categories are a facet** (tags), independent of the TOC hierarchy.
- **Multiple docsets merge into one** TOC/index/search (MS Help 2 collections);
  ids namespaced `docsetId:pageId`. Docsets group by `language`.
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
- wasm: `wasm-pack build compiler/wasm` (needs `wasm-pack`).
- Viewer: `cd viewer-ts && npm install && npm run dev|build|test|typecheck`.

## References
- The approved implementation plan lives in `~/.claude/plans/`.
- Original prototype behavior & gotchas: `HANDOFF.md`.
