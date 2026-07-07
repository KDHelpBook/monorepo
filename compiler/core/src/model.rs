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
    /// Ids of related pages (within this book) shown as a "See also" footer.
    pub related: Vec<String>,
    /// Force the on-page TOC on/off (`None` = auto). Emitted as a marker the viewer
    /// reads; not stored as its own column.
    pub toc: Option<bool>,
}

/// A complete docset with Markdown pages.
#[derive(Debug, Clone)]
pub struct SourceDocset {
    pub id: String,
    pub title: String,
    pub version: String,
    pub language: String,
    /// The product/family this book belongs to. Books sharing a `collection` merge
    /// seamlessly; different collections are shown as separate folders. Defaults to
    /// the docset id (each book its own singleton family).
    pub collection: String,
    /// Display title for the family (defaults to the docset title).
    pub collection_title: String,
    /// Products this book belongs to (many-to-many facet; defaults to one named
    /// after `collection`). Separate from `collection`, which is the merge key.
    pub products: Vec<Product>,
    pub pages: Vec<SourcePage>,
    pub toc: Vec<TocNode>,
    pub categories: Vec<Category>,
    /// Binary attachments (images, downloadable files) collected from `assets/`.
    pub assets: Vec<Asset>,
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

/// A product a book belongs to (id + display title). Many-to-many: a book may list
/// several. Distinct from `collection` (the merge/family key) — products are only a
/// filter facet, driving the viewer's "Filter by product" scope.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Product {
    pub id: String,
    pub title: String,
}

/// A binary attachment — an image or downloadable file referenced by pages. Stored
/// either embedded in the `.khb` or in a sidecar `.khba`; either way the bytes live
/// inside a self-contained SQLite container. `path` is the docset-relative path
/// authors reference (e.g. `assets/diagram.svg`); pages link to it as `asset:<path>`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Asset {
    pub path: String,
    pub mime: String,
    pub data: Vec<u8>,
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
    /// Ids of related pages (within this book), for a "See also" footer.
    #[serde(default)]
    pub related: Vec<String>,
    /// Optional clean Markdown for the body (the pre-render source, minus
    /// frontmatter). `None` when the producer has no Markdown source. Not used by the
    /// viewer — only by AI-facing consumers (llms.txt export, a future MCP server).
    #[serde(default)]
    pub md: Option<String>,
}

/// A complete rendered docset — the pivot shared by `.khb` and `.khbb`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RenderedDocset {
    pub id: String,
    pub title: String,
    pub version: String,
    pub language: String,
    /// Product/family id (see [`SourceDocset::collection`]).
    pub collection: String,
    /// Product/family display title.
    pub collection_title: String,
    /// Products this book belongs to (many-to-many facet, separate from `collection`).
    #[serde(default)]
    pub products: Vec<Product>,
    pub pages: Vec<RenderedPage>,
    pub toc: Vec<TocNode>,
    pub categories: Vec<Category>,
    #[serde(default)]
    pub assets: Vec<Asset>,
}
