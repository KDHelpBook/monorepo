# kdhelp

A documentation reader in the spirit of **Microsoft Document Explorer** — the
MSDN Library viewer that shipped with Visual Studio 2008 (`dexplore.exe`).
Period-authentic chrome, modern engine.

Write your docs, compile them into a self-contained **`.khb`** docset (a SQLite
database with a prebuilt full-text index), and read them in a fast web viewer
that can **merge multiple docsets into one** table of contents, index, and
search — just like MS Help 2 collections.

## Repository layout

This is a monorepo with three parts:

| Path | What it is |
|------|------------|
| [`compiler/`](compiler/) | Rust **Cargo workspace** — the data engine. Crates: `core` (format, queries, SQLite + FTS5, streaming VFS, `.khbb` converter — compiled to **native** *and* **wasm**), `cli` (the `kdhelp` command), `wasm` (browser bindings). |
| [`viewer-ts/`](viewer-ts/) | Vite + TypeScript viewer — **UI only**, backed by the wasm `core`. |
| [`docs/`](docs/) | The `.khb` format specification and the compiler manual. |

The `viewer-ts` app began as a single-file HTML prototype (`help-viewer.html`,
documented in `HANDOFF.md`); that prototype has been removed now that the viewer
reached parity — it remains in the project's git history.

## Desktop (Tauri)

The viewer runs unchanged inside a **Tauri** window for an offline desktop app —
see [`docs/desktop.md`](docs/desktop.md).

## Formats

- **`.khb`** — a SQLite docset ("Help Book"). The form queried at runtime.
- **`.khbb`** — a minimal binary (no prebuilt indexes) that the viewer rebuilds
  into a `.khb` in the browser (via wasm) and caches. Smallest download.
- **`.khba`** — a sidecar attachments file (images and downloads) for a `.khb`.
  Attachments can also be embedded directly in the `.khb`; one docset may have
  several `.khba` packs.
- **`.gz` suffix** — any of the above may be gzip-compressed for smaller transfer
  (`foo.khb.gz`, `foo.khba.gz`), decompressed in-browser with the native
  `DecompressionStream`.

## Quick start

```bash
# 1. Build the compiler and produce the demo docsets
cd compiler
cargo run -p kdhelp-cli -- compile examples/en -o examples.en.khb

# 2. Run the viewer (dev)
cd ../viewer-ts
npm install
npm run dev
```

## Distribution

`kdhelp pack` assembles a ready-to-host static distribution (viewer + docsets +
a `docsets.json` manifest); `kdhelp patch` updates an already-built one without
rebuilding the viewer. Two profiles:

- **`reader`** — the general viewer: users can open/upload other docsets; PWA on.
- **`bundled --lock`** — a single product's docs, external sources disabled, PWA off.

Host the result on any static host (e.g. GitHub Pages), or wrap it in **Tauri**
for an offline desktop app (the same Rust `core` runs natively there).

## License

[MIT](LICENSE) © 2026 Krystian Duma
