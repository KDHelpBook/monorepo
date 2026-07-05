/*
 * Stub for the optional Liam Healy "extension-functions.c" extras
 * (sqlite.org/contrib). Those extra SQL math/string helpers are NOT needed for
 * kdhelp (FTS5 + streaming), and the upstream download was unavailable at build
 * time. `vpath %.c src` resolves this ahead of the downloaded deps/ copy, so the
 * build needs no network for it. A no-op keeps the exported
 * `_RegisterExtensionFunctions` symbol (referenced by src/sqlite-api.js) valid.
 * SQLite 3.53 is built here with --enable-all, which already provides
 * SQLITE_ENABLE_MATH_FUNCTIONS.
 */
#include "sqlite3.h"

int RegisterExtensionFunctions(sqlite3 *db) {
  (void)db;
  return SQLITE_OK;
}
