# Desktop app (Tauri)

The desktop build wraps the same viewer UI in a native window, but swaps the data layer:
in the browser the viewer queries `.khb` with the bundled wa-sqlite engine, while on the
desktop it calls the **native Rust `khb-core`** (bundled SQLite, real bm25 FTS5) over Tauri
IPC. Same `IDocset` contract, same UI — different backend. Rust owns the open docsets, which
is the one native source of truth the future embedded MCP server will share.

## Layout

- `viewer-ts/src-tauri/` — the Tauri (Rust) app. A **standalone crate** (not a member of the
  `compiler/` workspace) that path-depends on `khb-core`.
  - `src/lib.rs` — the IPC commands: `bundled_docsets`, `open_docsets`, `page`, `asset`,
    `search`. They map `khb-core` results into camelCase DTOs matching
    `viewer-ts/src/data/docset.ts`. Open docsets live in `Mutex<HashMap<id, Book>>` state.
  - `tauri.conf.json` — `frontendDist` is the web `../dist`; the demo docsets are bundled
    from `../public/docsets` into the app's `resources/docsets/`.
- `viewer-ts/src/data/tauri-docset.ts` — `TauriDocset implements IDocset`: eager structure
  cached at open (via the same `buildTocTree`), `page`/`asset`/`search` are `invoke()` calls.
- `viewer-ts/src/main.ts` — `bootstrap()` detects Tauri (`__TAURI_INTERNALS__`) and runs
  `bootstrapTauri()`: open the bundled docsets natively → `Collection.of` → `start`.

## Build & run (macOS/Windows/Linux desktop)

Prerequisite: the Rust toolchain + the platform's Tauri system deps (on macOS, Xcode CLT;
see <https://tauri.app/start/prerequisites/>).

```sh
cd viewer-ts
npm install
npm run tauri:dev     # dev: runs `vite` + opens the window (hot-reloads the UI)
npm run tauri:build   # release: bundles a native installer
```

`cargo build` inside `viewer-ts/src-tauri/` compiles the Rust backend alone (what CI/headless
can check); the window itself needs a desktop session.

## What works today (MVP)

- Opens the **bundled** docsets through native `khb-core` and shows **one edition per family**
  in the chosen language (dedupes en/pl + v1/v2). TOC, index, search (native FTS5), tabs,
  categories, and the sandboxed page frame all work through the shared UI.

## Follow-ups (deliberately deferred)

- **File → Open** a `.khb` from disk (native `@tauri-apps/plugin-dialog` → `open_docsets`).
  Paths, not byte blobs, are the model — the same files the MCP server will reopen. Today the
  web open/upload/remote affordances are hidden (`externalSources:false`).
- **Live language / version switchers** on desktop — the web ones drive a rebuild through
  `Collection.load` + `DocsetSource`; the desktop path needs that rebuild adapted to
  `TauriDocset`.
- **CSP.** `tauri.conf.json` sets `security.csp: null` for now — the reader's security boundary
  is the sandboxed `<iframe srcdoc>` (as on the web, which ships no CSP), so a page's untrusted
  HTML can't reach the app. Tighten to an explicit policy once validated that it still lets the
  frame run its inline bridge and load `data:` assets.
- **Embedded MCP server** — a `khb-mcp` crate (`rmcp`, local HTTP) over the **same** managed
  `khb-core` docsets this app holds open (see the `mcp-server-with-tauri` plan).
- App icons are a generated placeholder; run `npm run tauri icon <src.png>` for real ones.
