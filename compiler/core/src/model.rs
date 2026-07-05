//! The in-memory data model.
//!
//! Two stages:
//! - [`SourceDocset`] — pages still as Markdown, produced by a source loader
//!   ([`crate::source`]). Front-end / format-specific.
//! - [`RenderedDocset`] — pages as rendered HTML + plain text. This is the pivot
//!   both output formats share: `.khb` (SQLite, [`crate::build`]) and `.khbb`
//!   (binary, [`crate::binary`]) are just two encodings of the same rendered data.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Source stage (Markdown in, format-specific)
// ---------------------------------------------------------------------------

/// A page whose body is still Markdown. Rendered by [`crate::render`].
#[derive(Debug, Clone)]
pub struct SourcePage {
    pub id: String,
    pub title: String,
    pub markdown: String,
    pub keywords: Vec<String>,
    /// Category ids this page belongs to (the facet is many-to-many).
    pub categories: Vec<String>,
}

/// A complete docset with Markdown pages.
#[derive(Debug, Clone)]
pub struct SourceDocset {
    pub id: String,
    pub title: String,
    pub version: String,
    pub language: String,
    pub pages: Vec<SourcePage>,
    pub toc: Vec<TocNode>,
    pub categories: Vec<Category>,
}

// ---------------------------------------------------------------------------
// Shared structure (identical in both stages)
// ---------------------------------------------------------------------------

/// A node in the table-of-contents tree. `page_id` points at a page; `title` may
/// override the page title for display in the tree.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TocNode {
    pub page_id: String,
    pub title: String,
    #[serde(default)]
    pub children: Vec<TocNode>,
}

/// A category definition (the label/order for a facet tag).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: String,
    pub title: String,
}

// ---------------------------------------------------------------------------
// Rendered stage (HTML in, format-agnostic pivot)
// ---------------------------------------------------------------------------

/// A page rendered to HTML + plain text, ready to be encoded into a docset.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderedPage {
    pub id: String,
    pub title: String,
    pub body_html: String,
    pub plain: String,
    pub keywords: Vec<String>,
    pub categories: Vec<String>,
}

/// A complete rendered docset — the pivot shared by `.khb` and `.khbb`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderedDocset {
    pub id: String,
    pub title: String,
    pub version: String,
    pub language: String,
    pub pages: Vec<RenderedPage>,
    pub toc: Vec<TocNode>,
    pub categories: Vec<Category>,
}
