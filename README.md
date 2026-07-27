# KD Help Book

**KD Help Book** — a documentation reader with the look & feel of a **classic desktop
help viewer** (an early-2010s IDE aesthetic). Period-authentic chrome, modern engine.
(The CLI binary is **`khb`**, the crates are `khb-core`/`khb-cli`/`khb-wasm`, and a
compiled docset is a **`.khb`** — a "KD Help Book". Repo: `KDHelpBook/monorepo`.)

Write your docs, compile them into a self-contained **`.khb`** docset (a SQLite
database with a prebuilt full-text index), and read them in a fast web viewer
that can **merge multiple docsets into one** table of contents, index, and
search — the way classic help collections did.

## Repository layout

This is a monorepo with three parts:

| Path | What it is |
|------|------------|
| [`compiler/`](compiler/) | Rust **Cargo workspace** — the data engine. Crates: `core` (format, queries, SQLite + FTS5, streaming VFS, `.khbb` converter — compiled to **native** *and* **wasm**), `cli` (the `khb` command), `wasm` (browser bindings). |
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
cargo run -p khb-cli -- compile examples/en -o examples.en.khb

# 2. Run the viewer (dev)
cd ../viewer-ts
npm install
npm run dev
```

## Distribution

The first release is distributed through **GitHub Releases**, not crates.io.
Download the archive for your platform from the
[latest release](https://github.com/KDHelpBook/monorepo/releases/latest), extract
it, and place the `khb` executable somewhere on your `PATH`. The
`khb-core`, `khb-cli`, and `khb-wasm` workspace crates are implementation
packages and are not currently published to crates.io; in particular,
`cargo install khb-cli` is not an installation channel.

`khb pack` assembles a ready-to-host static distribution (viewer + docsets +
a `docsets.json` manifest); `khb patch` updates an already-built one without
rebuilding the viewer. Two profiles:

- **`reader`** — the general viewer: users can open/upload other docsets; PWA on.
- **`bundled --lock`** — a single product's docs, external sources disabled, PWA off.

Host the result on any static host (e.g. GitHub Pages), or wrap it in **Tauri**
for an offline desktop app (the same Rust `core` runs natively there).

### Verifying release downloads

Each GitHub release includes a `SHA256SUMS` manifest. Download it alongside the
archive or `.khb` file you want to verify, then run:

```bash
# Linux
sha256sum --check --ignore-missing SHA256SUMS

# macOS
shasum --algorithm 256 --check --ignore-missing SHA256SUMS
```

On Windows, open PowerShell in the download directory, set the downloaded file
name, and compare its calculated checksum with the manifest:

```powershell
$file = "khb-vX.Y.Z-x86_64-pc-windows-msvc.zip"
$expected = (Select-String -Path SHA256SUMS -Pattern "  $([regex]::Escape($file))$").Line.Split(' ')[0]
if ((Get-FileHash $file -Algorithm SHA256).Hash -eq $expected) { "OK" } else { throw "SHA-256 mismatch" }
```

## License

[MIT](LICENSE) © 2026 Krystian Duma
