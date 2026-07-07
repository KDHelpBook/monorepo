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
            // Rewrite `assets/…` image/link targets to the `asset:` scheme, then
            // render `$…$` LaTeX spans to MathML.
            let rendered = render_math(&assets::rewrite_asset_urls(&markdown::render_html(
                &p.markdown,
                Some(&highlighter),
            )));
            // Prepend an "On this page" nav built from the heading anchors, honouring
            // the page's `toc` frontmatter (auto when unset). It floats top-right, so
            // sitting before the H1 keeps the viewer's subtitle handling intact.
            let body_html = match build_page_toc(&rendered, p.toc, &src.language) {
                Some(nav) => format!("{nav}{rendered}"),
                None => rendered,
            };
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

/// Build the "On this page" nav from a rendered page's heading anchors, or `None`.
/// `toc` forces it on/off; when unset it shows only for pages with ≥2 top-level (H2)
/// sections. The nav floats, so callers prepend it before the H1.
fn build_page_toc(html: &str, toc: Option<bool>, lang: &str) -> Option<String> {
    if toc == Some(false) {
        return None;
    }
    let heads = extract_headings(html);
    let topics = heads.iter().filter(|(level, ..)| *level == 2).count();
    let show = match toc {
        Some(true) => !heads.is_empty(),
        _ => topics >= 2, // auto: "more topics"
    };
    if !show {
        return None;
    }

    let title = esc(match lang {
        "pl" => "Na tej stronie",
        _ => "On this page",
    });
    let mut nav = format!("<nav class=\"page-toc\" aria-label=\"{title}\"><p class=\"page-toc-title\">{title}</p><ul>");
    for (level, id, text) in &heads {
        let cls = if *level == 3 { " class=\"sub\"" } else { "" };
        nav.push_str(&format!(
            "<li{cls}><a href=\"#{}\">{}</a></li>",
            esc(id),
            esc(text)
        ));
    }
    nav.push_str("</ul></nav>");
    Some(nav)
}

/// Scan rendered HTML for `<h2>`/`<h3>` headings, returning `(level, id, text)` in
/// document order. The id comes from the anchor `header_ids` inserts first in each
/// heading; the text is the heading's inline content flattened to plain text.
fn extract_headings(html: &str) -> Vec<(u8, String, String)> {
    let bytes = html.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i + 3 < bytes.len() {
        let is_h = bytes[i] == b'<'
            && bytes[i + 1] == b'h'
            && matches!(bytes[i + 2], b'2' | b'3')
            && matches!(bytes[i + 3], b'>' | b' ' | b'\t');
        if !is_h {
            i += 1;
            continue;
        }
        let level = bytes[i + 2] - b'0';
        let close = format!("</h{level}>");
        let Some(open_end) = html[i..].find('>').map(|o| i + o + 1) else {
            break;
        };
        let Some(inner_len) = html[open_end..].find(&close) else {
            break;
        };
        let inner = &html[open_end..open_end + inner_len];
        if let Some(id) = attr_value(inner, "id") {
            let text = markdown::html_to_plain(inner);
            if !text.is_empty() {
                out.push((level, id, text));
            }
        }
        i = open_end + inner_len + close.len();
    }
    out
}

/// The value of the first `attr="…"` in `html`, if any.
fn attr_value(html: &str, attr: &str) -> Option<String> {
    let needle = format!("{attr}=\"");
    let start = html.find(&needle)? + needle.len();
    let end = html[start..].find('"')? + start;
    Some(html[start..end].to_string())
}

/// Replace comrak's math spans (`<span data-math-style="…">LaTeX</span>`) with native
/// MathML, rendered at build time so the viewer needs no KaTeX/MathJax. A formula
/// comrak's converter can't parse is left as its raw-LaTeX span.
fn render_math(html: &str) -> String {
    use latex2mathml::{latex_to_mathml, DisplayStyle};
    const MARK: &str = "<span data-math-style=\"";
    const CLOSE: &str = "</span>";
    let mut out = String::with_capacity(html.len());
    let mut i = 0;
    while let Some(rel) = html[i..].find(MARK) {
        let start = i + rel;
        let after = start + MARK.len();
        let Some(qpos) = html[after..].find("\">") else {
            break;
        };
        let style = &html[after..after + qpos];
        let latex_start = after + qpos + 2; // skip `">`
        let Some(end_rel) = html[latex_start..].find(CLOSE) else {
            break;
        };
        let latex = unescape_html(&html[latex_start..latex_start + end_rel]);
        let display = if style == "display" {
            DisplayStyle::Block
        } else {
            DisplayStyle::Inline
        };
        out.push_str(&html[i..start]);
        match latex_to_mathml(&latex, display) {
            Ok(mathml) => out.push_str(&mathml),
            Err(_) => out.push_str(&html[start..latex_start + end_rel + CLOSE.len()]),
        }
        i = latex_start + end_rel + CLOSE.len();
    }
    out.push_str(&html[i..]);
    out
}

/// Decode the HTML entities comrak escapes into a math span's LaTeX literal.
fn unescape_html(s: &str) -> String {
    s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}

/// HTML-escape text for attribute/element content.
fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;

    // Mimics comrak's header_ids output: an empty anchor carrying the id, then text.
    const HTML: &str = "<h1><a class=\"anchor\" id=\"t\"></a>Title</h1>\
        <h2><a class=\"anchor\" id=\"a\"></a>Alpha</h2>\
        <h3><a class=\"anchor\" id=\"a1\"></a>Sub</h3>\
        <h2><a class=\"anchor\" id=\"b\"></a>Beta</h2>";

    #[test]
    fn page_toc_auto_shows_for_two_sections() {
        let nav = build_page_toc(HTML, None, "en").expect("2 H2s → auto TOC");
        assert!(nav.starts_with("<nav class=\"page-toc\""));
        assert!(nav.contains("On this page"));
        assert!(nav.contains("<li><a href=\"#a\">Alpha</a></li>"));
        assert!(nav.contains("<li class=\"sub\"><a href=\"#a1\">Sub</a></li>")); // H3 nested
        assert!(nav.contains("<li><a href=\"#b\">Beta</a></li>"));
    }

    #[test]
    fn renders_math_to_mathml() {
        let html = "<p>x <span data-math-style=\"inline\">a^2</span> y</p>\
                    <p><span data-math-style=\"display\">a+b</span></p>";
        let out = render_math(html);
        assert!(out.contains("<math") && out.contains("display=\"inline\""));
        assert!(out.contains("display=\"block\""));
        assert!(!out.contains("data-math-style")); // spans replaced
        assert!(out.contains("<p>x ") && out.contains(" y</p>")); // surrounding text kept
        assert!(out.contains("<msup>")); // a^2 → superscript
    }

    #[test]
    fn page_toc_respects_frontmatter_and_language() {
        assert!(build_page_toc(HTML, Some(false), "en").is_none()); // forced off
        assert!(build_page_toc(HTML, None, "pl")
            .unwrap()
            .contains("Na tej stronie"));
        // A single section: auto hides, but `toc: true` forces it on.
        let one = "<h2><a id=\"only\"></a>Only</h2>";
        assert!(build_page_toc(one, None, "en").is_none());
        assert!(build_page_toc(one, Some(true), "en").is_some());
    }
}
