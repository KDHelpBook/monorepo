# Desktop app (Tauri)

Tauri is a **future integration**. KD Help Book does not currently ship a desktop
application or installer. This page records the intended design, not an available
release channel.

Two things are worth knowing:

- **The webview can reuse the browser stack.** A prototype could load the same
  FTS5-enabled `wa-sqlite` viewer as the website.
- **Native SQLite is the intended integration.** The Rust `compiler/core` crate
  can later read `.khb` docsets from disk and expose `Docset` through Tauri
  commands.
- **Streamed & remote content** (including a `khb-asset://` protocol for streamed
  images/media, and online/hybrid docsets over HTTP Range) is a further step, sketched
  in [streaming.md](streaming.md).

## Proposed wiring

1. Build a bundled distribution to serve as the frontend:

   ```bash
   cd viewer-ts && npm run build
   cd ..
   compiler/target/release/khb compile compiler/examples/en -o out/en.khb
   compiler/target/release/khb pack --profile bundled --lock \
     --viewer viewer-ts/dist --docset out/en.khb -o desktop-dist
   ```

2. Add Tauri to the project (`npm create tauri-app@latest`, or add
   `src-tauri/` manually) and point `tauri.conf.json` at the packed output:

   ```jsonc
   {
     "build": {
       // Pre-built static site; no dev server needed.
       "frontendDist": "../desktop-dist"
     },
     "app": {
       "windows": [{ "title": "KD Help Book", "width": 1100, "height": 780 }]
     }
   }
   ```

3. During future application development, run or build it with the Tauri CLI:

   ```bash
   cargo tauri dev      # live desktop window
   cargo tauri build    # native installer
   ```

The `bundled --lock` profile is a good fit for a desktop build: the docs are
embedded and the "open other docsets" affordances are hidden.
