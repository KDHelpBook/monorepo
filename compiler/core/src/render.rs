//! Rendering: [`SourceDocset`] (Markdown) → [`RenderedDocset`] (HTML + plain text).
//!
//! This is where Markdown is turned into HTML, **once**, at build time.

use crate::model::{RenderedDocset, RenderedPage, SourceDocset};
use crate::{assets, markdown};

/// Render every page's Markdown to HTML and derive its plain-text form.
pub fn render(src: &SourceDocset) -> RenderedDocset {
    let pages = src
        .pages
        .iter()
        .map(|p| {
            // Rewrite `assets/…` image/link targets to the `asset:` scheme so the
            // viewer resolves them from the docset's attachment store.
            let body_html = assets::rewrite_asset_urls(&markdown::render_html(&p.markdown));
            let plain = markdown::html_to_plain(&body_html);
            RenderedPage {
                id: p.id.clone(),
                title: p.title.clone(),
                body_html,
                plain,
                keywords: p.keywords.clone(),
                categories: p.categories.clone(),
                related: p.related.clone(),
                // Carry the clean source Markdown (post-frontmatter) for llms.txt / MCP.
                md: Some(p.markdown.clone()),
            }
        })
        .collect();

    RenderedDocset {
        id: src.id.clone(),
        title: src.title.clone(),
        version: src.version.clone(),
        language: src.language.clone(),
        collection: src.collection.clone(),
        collection_title: src.collection_title.clone(),
        products: src.products.clone(),
        pages,
        toc: src.toc.clone(),
        categories: src.categories.clone(),
        assets: src.assets.clone(),
    }
}
