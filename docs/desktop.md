# Desktop app (Tauri)

The viewer is a static web app, so it runs unchanged inside a **[Tauri](https://tauri.app)**
window to give an offline desktop application with a native window and menus — in
the spirit of the original `dexplore.exe`.

Two things are worth knowing:

- **The webview reuses the browser stack.** Inside Tauri's webview the viewer
  loads exactly as in a browser (sql.js for SQLite, the same UI), so no code
  changes are required to ship a desktop build.
- **Native SQLite is an optional upgrade.** Because the whole data engine is the
  Rust `compiler/core` crate, a Tauri build can later read `.khb` docsets straight
  from disk with native SQLite (via `tauri-plugin-sql` or by exposing `core`'s
  `Docset` over Tauri commands) — dropping sql.js on the desktop and getting the
  real FTS5 index. That is a follow-up, not required for a working app.
- **Streamed & remote content** (including a `khb-asset://` protocol for streamed
  images/media, and online/hybrid docsets over HTTP Range) is a further step, sketched
  in [streaming.md](streaming.md).

## Wiring it up

1. Build a bundled distribution to serve as the frontend:

   ```bash
   cd viewer-ts && npm run build
   cd ..
   compiler/target/release/kdhelp compile compiler/examples/en -o out/en.khb
   compiler/target/release/kdhelp pack --profile bundled --lock \
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
       "windows": [{ "title": "kdhelp", "width": 1100, "height": 780 }]
     }
   }
   ```

3. Run / build:

   ```bash
   cargo tauri dev      # live desktop window
   cargo tauri build    # native installer
   ```

The `bundled --lock` profile is a good fit for a desktop build: the docs are
embedded and the "open other docsets" affordances are hidden.
