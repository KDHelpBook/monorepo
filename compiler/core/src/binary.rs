//! The `.khbb` binary format — a compact [postcard] encoding of a [`RenderedDocset`].
//!
//! `.khbb` carries the rendered pages, table of contents, categories and keywords
//! but **no SQLite container and no full-text index**, so it is the smallest way to
//! ship a docset. The viewer rebuilds a real `.khb` from it (via the wasm build of
//! [`crate::build::build_khb`]) and caches the result.
//!
//! [postcard]: https://docs.rs/postcard

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};

use crate::model::RenderedDocset;

/// A versioned wrapper so a `.khbb` can be validated before use.
#[derive(Serialize, Deserialize)]
struct KhbbFile {
    format_version: u32,
    docset: RenderedDocset,
}

/// Encode a rendered docset as `.khbb` bytes.
pub fn to_khbb(docset: &RenderedDocset) -> Result<Vec<u8>> {
    let file = KhbbFile {
        format_version: crate::FORMAT_VERSION,
        docset: docset.clone(),
    };
    Ok(postcard::to_allocvec(&file)?)
}

/// Decode `.khbb` bytes back into a rendered docset.
pub fn from_khbb(bytes: &[u8]) -> Result<RenderedDocset> {
    let file: KhbbFile = postcard::from_bytes(bytes)?;
    if file.format_version != crate::FORMAT_VERSION {
        bail!(
            "unsupported .khbb format version {} (expected {})",
            file.format_version,
            crate::FORMAT_VERSION
        );
    }
    Ok(file.docset)
}
