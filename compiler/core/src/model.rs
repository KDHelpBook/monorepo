//! The in-memory source model — a docset ready to be written.
//!
//! This is intentionally decoupled from any particular source format. The bundled
//! loader ([`crate::source`]) builds a [`SourceDocset`] from Markdown + YAML, but a
//! different front end could build the same struct from any format and still emit a
//! valid `.khb`.

/// A single page: `markdown` is the source body; the writer renders it to HTML and
/// plain text.
#[derive(Debug, Clone)]
pub struct SourcePage {
    pub id: String,
    pub title: String,
    pub markdown: String,
    pub keywords: Vec<String>,
    /// Category ids this page belongs to (the facet is many-to-many).
    pub categories: Vec<String>,
}

/// A node in the table-of-contents tree. `page_id` points at a page; `title` may
/// override the page title for display in the tree.
#[derive(Debug, Clone)]
pub struct SourceTocNode {
    pub page_id: String,
    pub title: String,
    pub children: Vec<SourceTocNode>,
}

/// A category definition (the label/order for a facet tag).
#[derive(Debug, Clone)]
pub struct SourceCategory {
    pub id: String,
    pub title: String,
}

/// A complete docset ready for [`crate::build::build_khb`].
#[derive(Debug, Clone)]
pub struct SourceDocset {
    pub id: String,
    pub title: String,
    pub version: String,
    /// BCP-47-ish language tag (e.g. `en`, `pl`). Selects the FTS tokenizer.
    pub language: String,
    pub pages: Vec<SourcePage>,
    pub toc: Vec<SourceTocNode>,
    pub categories: Vec<SourceCategory>,
}
