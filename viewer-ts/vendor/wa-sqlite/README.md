# Vendored wa-sqlite (custom **FTS5** Asyncify build)

This is [wa-sqlite](https://github.com/rhashimoto/wa-sqlite) **1.1.1** — an
Emscripten build of SQLite with a JavaScript VFS layer — rebuilt from source
**with FTS5 enabled**, because the prebuilt npm artifact ships *without* FTS5.

It powers the browser page-level streaming engine
(`src/data/streaming.ts`): an async Range VFS opens a remote `.khb` over HTTP
`Range` and runs real, bm25-ranked FTS5 `MATCH` over only the index pages a query
touches. See [`docs/streaming.md`](../../../docs/streaming.md).

## What's here

| Path | Origin |
|------|--------|
| `src/*.js` | wa-sqlite 1.1.1 JS API (unmodified) — `sqlite-api.js`, `VFS.js`, `FacadeVFS.js`, … |
| `dist/wa-sqlite-async.mjs` + `.wasm` | **our** build: SQLite 3.53 + FTS5, Asyncify |
| `build/build-wasqlite.sh` | one-command reproducible build (Docker only) |
| `build/extension-functions.stub.c` | build-time stub (see below) |
| `LICENSE` | wa-sqlite's MIT license |

Only the Asyncify (`-async`) artifact is vendored — it's the one an async VFS
needs. The JS and the wasm are the **same 1.1.1 release**, so the JS↔wasm ABI
matches (the 1.0.0 npm JS uses a different `registerVFS` glue and is *not*
compatible with this wasm).

## Why the wasm isn't the npm one

- **FTS5.** wa-sqlite's published `dist/*.wasm` is built without FTS5
  (`SELECT … MATCH` → *"no such module: fts5"*). Real in-browser full-text search
  needs a custom build; there is no off-the-shelf FTS5 wa-sqlite binary.
- Verified: this build reports FTS5 present and returns bm25-ranked hits; the npm
  one does not.

## How to rebuild / update

Everything is scripted. Needs **Docker only** — no local Emscripten:

```sh
viewer-ts/vendor/wa-sqlite/build/build-wasqlite.sh
```

It clones the pinned wa-sqlite commit, applies the stub, builds the async+FTS5
wasm in `emscripten/emsdk:3.1.61`, copies the artifacts back here, and checks that
FTS5 landed. **To update** wa-sqlite or SQLite, bump `WA_SQLITE_REF` (and
`EMSDK_IMAGE`) at the top of the script — the SQLite version is pinned inside
wa-sqlite's own Makefile.

The key flag the script passes is **`WASQLITE_EXTRA_DEFINES=-DSQLITE_ENABLE_FTS5`**.
wa-sqlite builds its amalgamation with SQLite's `configure --enable-all` (which
*includes* the FTS5 source), but its emcc `WASQLITE_DEFINES` do **not** define
`SQLITE_ENABLE_FTS5`, so the FTS5 code is compiled out unless this flag is added.

Pins live at the top of `build/build-wasqlite.sh`: the wa-sqlite commit
(`c4d54d3…`, the 1.1.1 line), the toolchain image (`emscripten/emsdk:3.1.61`,
matching wa-sqlite 1.1.1's CI), and SQLite 3.53 (from wa-sqlite's Makefile).

### The extension-functions stub

wa-sqlite's default build also downloads Liam Healy's optional
`extension-functions.c` from `sqlite.org/contrib` (extra SQL math/string helpers).
kdhelp doesn't use those, and the endpoint was unavailable at build time, so we
replace it with a no-op that keeps the exported `_RegisterExtensionFunctions`
symbol valid (`build/extension-functions.stub.c`). `vpath %.c src` makes the build
pick it up ahead of the downloaded copy — no network needed. SQLite 3.53 already
provides `SQLITE_ENABLE_MATH_FUNCTIONS` via `--enable-all`.

## License

wa-sqlite is MIT (Roy T. Hashimoto) — see `LICENSE`. SQLite is public domain.
