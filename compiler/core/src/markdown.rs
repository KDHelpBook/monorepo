//! Markdown rendering and plain-text extraction.
//!
//! The compiler renders Markdown to HTML **once**, at build time, and stores the
//! HTML in the docset. The viewer never needs a Markdown engine. We also derive a
//! plain-text version of each page for the full-text index and snippets.

use comrak::plugins::syntect::SyntectAdapter;
use comrak::{Options, Plugins};

/// A reusable syntax highlighter for fenced code blocks. Loading syntect's default
/// syntax + theme sets is the expensive part, so build one and reuse it across a
/// docset's pages (see [`crate::render`]). `InspiredGitHub` is a light theme that
/// suits the viewer's white content pane, and it emits **inline styles** — so the
/// highlighted HTML is self-contained in the `.khb` and needs no runtime CSS or JS.
pub fn highlighter() -> SyntectAdapter {
    SyntectAdapter::new(Some("InspiredGitHub"))
}

/// Render Markdown to HTML with a GFM-flavoured feature set (tables, strikethrough,
/// autolinks, task lists, footnotes). With `Some(highlighter)`, fenced code blocks
/// that declare a language are syntax-highlighted (inline styles). With `None`, code
/// is rendered plain — used for the `plain` text extraction, so token-splitting spans
/// don't pollute the search text. Raw inline HTML is escaped, not passed through —
/// authored content is Markdown, and docsets may come from untrusted sources.
pub fn render_html(markdown: &str, highlighter: Option<&SyntectAdapter>) -> String {
    let mut options = Options::default();
    options.extension.table = true;
    options.extension.strikethrough = true;
    options.extension.autolink = true;
    options.extension.tasklist = true;
    options.extension.footnotes = true;

    let mut plugins = Plugins::default();
    if let Some(h) = highlighter {
        plugins.render.codefence_syntax_highlighter = Some(h);
    }
    comrak::markdown_to_html_with_plugins(markdown, &options, &plugins)
}

/// Best-effort conversion of rendered HTML to searchable plain text: drop tags,
/// decode the common entities, collapse whitespace.
pub fn html_to_plain(html: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut in_tag = false;
    for ch in html.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => {
                in_tag = false;
                out.push(' ');
            }
            _ if in_tag => {}
            _ => out.push(ch),
        }
    }
    let decoded = out
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ");
    decoded.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Extract the first level-1 heading text from a Markdown source, if any. Used as a
/// title fallback when a page has no explicit `title`.
pub fn first_h1(markdown: &str) -> Option<String> {
    for line in markdown.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix("# ") {
            return Some(rest.trim().to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_tags_and_collapses() {
        let html = render_html("# Title\n\nSome **bold** text.", None);
        let plain = html_to_plain(&html);
        assert_eq!(plain, "Title Some bold text.");
    }

    #[test]
    fn finds_first_heading() {
        assert_eq!(first_h1("intro\n\n# Hello\n"), Some("Hello".to_string()));
        assert_eq!(first_h1("no heading here"), None);
    }

    #[test]
    fn highlights_a_fenced_code_block() {
        let src = "```rust\nlet x = 1;\n```\n";
        let hl = highlighter();
        // With a highlighter: syntect emits inline-styled spans in a themed <pre>.
        let hot = render_html(src, Some(&hl));
        assert!(hot.contains("<pre"));
        assert!(hot.contains("style=\"color:"), "tokens carry inline colors");
        // Without one (the plain path): code text stays intact, no span artifacts.
        let cold = render_html(src, None);
        assert!(html_to_plain(&cold).contains("let x = 1;"));
    }
}
