//! Internal placeholder for a possible future WebAssembly integration.
//!
//! This crate intentionally exposes no browser backend. The shipped viewer uses
//! its own FTS5-enabled `wa-sqlite` runtime.

/// Returns the underlying `khb-core` generator string.
pub fn core_generator() -> String {
    khb_core::generator()
}
