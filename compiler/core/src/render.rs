//! Rendering: [`SourceDocset`] (Markdown) → [`RenderedDocset`] (HTML + plain text).
//!
//! This is where Markdown is turned into HTML, **once**, at build time.

use crate::markdown;
use crate::model::{RenderedDocset, RenderedPage, SourceDocset};

/// Render every page's Markdown to HTML and derive its plain-text form.
pub fn render(src: &SourceDocset) -> RenderedDocset {
    let pages = src
        .pages
        .iter()
        .map(|p| {
            let body_html = markdown::render_html(&p.markdown);
            let plain = markdown::html_to_plain(&body_html);
            RenderedPage {
                id: p.id.clone(),
                title: p.title.clone(),
                body_html,
                plain,
                keywords: p.keywords.clone(),
                categories: p.categories.clone(),
            }
        })
        .collect();

    RenderedDocset {
        id: src.id.clone(),
        title: src.title.clone(),
        version: src.version.clone(),
        language: src.language.clone(),
        pages,
        toc: src.toc.clone(),
        categories: src.categories.clone(),
    }
}
