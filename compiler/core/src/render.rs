//! Rendering: [`SourceDocset`] (Markdown) → [`RenderedDocset`] (HTML + plain text).
//!
//! This is where Markdown is turned into HTML, **once**, at build time.

use crate::model::{RenderedDocset, RenderedPage, SourceDocset};
use crate::{assets, markdown};

/// Render every page's Markdown to HTML and derive its plain-text form.
pub fn render(src: &SourceDocset) -> RenderedDocset {
    // One highlighter for the whole docset — building it loads syntect's syntax +
    // theme sets, which we don't want to repeat per page.
    let highlighter = markdown::highlighter();
    let pages = src
        .pages
        .iter()
        .map(|p| {
            // Rewrite `assets/…` image/link targets to the `asset:` scheme so the
            // viewer resolves them from the docset's attachment store. An explicit
            // `toc` frontmatter is carried as a leading marker the viewer reads to
            // force the on-page table of contents on/off (absent → auto).
            let toc_marker = match p.toc {
                Some(true) => "<!--kdhelp:toc=on-->",
                Some(false) => "<!--kdhelp:toc=off-->",
                None => "",
            };
            let body_html = format!(
                "{toc_marker}{}",
                assets::rewrite_asset_urls(&markdown::render_html(&p.markdown, Some(&highlighter)))
            );
            // Plain text comes from an *unhighlighted* render — syntect's per-token
            // spans would otherwise splatter the search text with stray spaces.
            let plain = markdown::html_to_plain(&markdown::render_html(&p.markdown, None));
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
