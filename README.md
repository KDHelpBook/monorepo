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
| [`compiler/`](compiler/) | Rust **Cargo workspace** — the native data engine. Crates: `core` (format, queries, SQLite + FTS5, streaming VFS), `cli` (the `khb` command), and an internal `wasm` placeholder reserved for future work. |
| [`viewer-ts/`](viewer-ts/) | Vite + TypeScript viewer using a browser-native `wa-sqlite` build with FTS5. |
| [`docs/`](docs/) | The `.khb` format specification and the compiler manual. |

The `viewer-ts` app began as a single-file HTML prototype (`help-viewer.html`,
documented in `HANDOFF.md`); that prototype has been removed now that the viewer
reached parity — it remains in the project's git history.

## Desktop (Tauri)

Tauri is a future integration, not a shipped application. The intended design is
documented in [`docs/desktop.md`](docs/desktop.md).

## Formats

- **`.khb`** — a SQLite docset ("Help Book"). The form queried at runtime.
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

Install the CLI by downloading the archive for your platform from the
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

Host the result on any static host (for example GitHub Pages). A native Tauri
wrapper is planned but is not part of the current distribution.

### System requirements

- Linux x86_64 or ARM64 with glibc 2.35 or newer.
- macOS on Apple silicon or Intel.
- Windows x86_64.

Release binaries are currently unsigned. macOS Gatekeeper and Windows
SmartScreen may therefore require an explicit one-time approval. The project
does not currently provide code signing or Apple notarization.

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
