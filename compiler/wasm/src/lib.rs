//! kdhelp-wasm — browser bindings for `kdhelp-core`.
//!
//! Phase 1c wires this up with wasm-bindgen / serde-wasm-bindgen to expose the
//! `Docset`/`Collection` API, the four load shapes (compact / streaming / binary
//! / upload) and the HTTP-Range VFS. For now it only re-exports the core version
//! so the workspace builds and tests on the native target.

/// Returns the underlying `kdhelp-core` generator string.
pub fn core_generator() -> String {
    kdhelp_core::generator()
}
