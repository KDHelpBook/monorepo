//! kdhelp-core — the shared data engine.
//!
//! This crate owns everything about the `.khb` docset format: the SQLite schema,
//! the source model, Markdown rendering, the writer, and the `Docset`/`Collection`
//! query API. It is compiled both natively (for the CLI and, later, Tauri) and to
//! wasm (for the browser viewer). It must stay free of any DOM or JS assumptions.
//!
//! The real implementation lands in Phase 1; this is the crate skeleton.

/// The on-disk `.khb` format version this build reads and writes.
pub const FORMAT_VERSION: u32 = 1;

/// The crate version, surfaced in a docset's `meta.generator`.
pub fn generator() -> String {
    format!("kdhelp-core {}", env!("CARGO_PKG_VERSION"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generator_reports_crate_version() {
        assert!(generator().starts_with("kdhelp-core "));
    }

    #[test]
    fn format_version_is_set() {
        assert_eq!(FORMAT_VERSION, 1);
    }
}
