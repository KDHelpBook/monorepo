import initSqlJs, { type SqlJsStatic } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";

let cached: Promise<SqlJsStatic> | null = null;

/**
 * Lazily initialise sql.js (SQLite compiled to WebAssembly), loaded once and
 * shared by every docset. The Rust `core` is the engine for the CLI and Tauri;
 * in the browser we mirror its SQL through sql.js.
 */
export function getSqlJs(): Promise<SqlJsStatic> {
  cached ??= initSqlJs({ locateFile: () => sqlWasmUrl });
  return cached;
}
