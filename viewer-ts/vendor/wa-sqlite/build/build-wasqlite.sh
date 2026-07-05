#!/usr/bin/env bash
#
# Reproducible build of the vendored FTS5-enabled wa-sqlite (async / Asyncify).
#
# Rebuilds viewer-ts/vendor/wa-sqlite/{dist,src} from source. Needs **Docker
# only** — no local Emscripten. Run from anywhere:
#
#     viewer-ts/vendor/wa-sqlite/build/build-wasqlite.sh
#
# Why this exists: the prebuilt wa-sqlite (npm) ships WITHOUT FTS5, so its
# `MATCH` fails with "no such module: fts5". wa-sqlite's amalgamation already
# includes the FTS5 source (SQLite `configure --enable-all`); its emcc defines
# just don't enable it — hence WASQLITE_EXTRA_DEFINES below. See ../README.md.
#
# To UPDATE wa-sqlite / SQLite: bump WA_SQLITE_REF (and EMSDK_IMAGE to whatever
# that release's CI uses — see its .github/workflows). The SQLite version is
# pinned inside wa-sqlite's own Makefile.
set -euo pipefail

# --- pins (change these to update) ------------------------------------------
WA_SQLITE_REPO="https://github.com/rhashimoto/wa-sqlite.git"
# Exact commit the vendored artifacts were built from (the 1.1.1 line;
# the v1.1.1 tag itself is b9ddadce32480857cde28e7b1512cf45fa08ab73).
WA_SQLITE_REF="c4d54d3ac3bdb99a01cc41a62eac28803661bd35"
EMSDK_IMAGE="emscripten/emsdk:3.1.61"   # wa-sqlite 1.1.1's CI Emscripten version
FTS_DEFINE="-DSQLITE_ENABLE_FTS5"       # the whole point: turn FTS5 on

# --- paths ------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENDOR_DIR="$(dirname "$SCRIPT_DIR")"           # viewer-ts/vendor/wa-sqlite
STUB="$SCRIPT_DIR/extension-functions.stub.c"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "==> cloning wa-sqlite @ ${WA_SQLITE_REF:0:12}"
git clone --quiet "$WA_SQLITE_REPO" "$WORK/src"
git -C "$WORK/src" checkout --quiet "$WA_SQLITE_REF"

# Replace the optional Liam Healy extras (an unreliable sqlite.org/contrib
# download kdhelp doesn't use) with a no-op stub. `vpath %.c src` picks it up
# ahead of the downloaded deps/ copy, so the build needs no network for it.
echo "==> applying extension-functions stub"
cp "$STUB" "$WORK/src/src/extension-functions.c"

echo "==> building async + FTS5 wasm in $EMSDK_IMAGE (a few minutes)"
docker run --rm -v "$WORK/src:/work" -w /work "$EMSDK_IMAGE" bash -lc '
  set -e
  # The SQLite amalgamation build (configure --enable-all && make sqlite3.c)
  # needs a host toolchain + curl for the tarball; install if the image lacks them.
  command -v curl >/dev/null || { apt-get update -qq && apt-get install -y -qq curl; }
  command -v gcc  >/dev/null || { apt-get update -qq && apt-get install -y -qq build-essential; }
  make WASQLITE_EXTRA_DEFINES="'"$FTS_DEFINE"'" dist/wa-sqlite-async.mjs
'

echo "==> copying artifacts into vendor/"
cp "$WORK/src/dist/wa-sqlite-async.mjs"  "$VENDOR_DIR/dist/"
cp "$WORK/src/dist/wa-sqlite-async.wasm" "$VENDOR_DIR/dist/"
cp "$WORK/src/src/"*.js                  "$VENDOR_DIR/src/"
cp "$WORK/src/LICENSE"                    "$VENDOR_DIR/" 2>/dev/null || true

fts_hits="$(strings "$VENDOR_DIR/dist/wa-sqlite-async.wasm" | grep -ci fts5 || true)"
echo "==> done. fts5 strings in wasm: $fts_hits (expect >0)"
if [ "$fts_hits" -eq 0 ]; then
  echo "!! WARNING: no fts5 symbols found — FTS5 may not be enabled." >&2
  exit 1
fi
echo "   Runtime check: streamProbe(url).hasFts5 must be true (see ../README.md)."
