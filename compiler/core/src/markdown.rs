//! Markdown rendering and plain-text extraction.
//!
//! The compiler renders Markdown to HTML **once**, at build time, and stores the
//! HTML in the docset. The viewer never needs a Markdown engine. We also derive a
//! plain-text version of each page for the full-text index and snippets.

use comrak::options::Plugins;
use comrak::plugins::syntect::SyntectAdapter;
use comrak::Options;

/// The light and dark syntect themes the code-block CSS is generated from. Light is
/// the default; dark is served under the viewer's dark hook. Kept here so the CSS
/// generator ([`syntax_theme_css`]) and any future switch stay in one place.
const THEME_LIGHT: &str = "InspiredGitHub";
const THEME_DARK: &str = "base16-ocean.dark";

/// A reusable syntax highlighter for fenced code blocks. Loading syntect's default
/// syntax set is the expensive part, so build one and reuse it across a docset's
/// pages (see [`crate::render`]).
///
/// It emits **CSS classes** (`ClassStyle::Spaced`), not inline styles — the colours
/// come from a stylesheet the viewer injects ([`syntax_theme_css`]), so code blocks
/// follow the app theme (e.g. a future dark mode) instead of baking one theme into
/// every `.khb`. The trade-off: rendering needs the viewer's CSS to show colour.
pub fn highlighter() -> SyntectAdapter {
    SyntectAdapter::new(None)
}

/// Re-highlight `code` **line by line**, wrapping each line in `<span class="cl">` (or
/// `cl hl` for a highlighted line). Used for the `{2,4-6}` line-highlight flag: syntect's
/// normal output lets scope spans cross line boundaries, so there's no per-line element
/// to tint — this rebuilds the block with self-contained lines (carried scopes are
/// reopened at each line start and all open spans closed at its end). Same class scheme
/// as [`highlighter`], so the existing stylesheet colours it. `hl` holds 1-based lines.
pub fn highlight_lines(code: &str, lang: &str, hl: &std::collections::HashSet<usize>) -> String {
    use std::sync::OnceLock;
    use syntect::html::{line_tokens_to_classed_spans, ClassStyle};
    use syntect::parsing::{ParseState, ScopeStack, SyntaxSet};
    use syntect::util::LinesWithEndings;

    // Loading the default syntax set is expensive; do it once (line-highlight is rare).
    static SYNTAX_SET: OnceLock<SyntaxSet> = OnceLock::new();
    let ss = SYNTAX_SET.get_or_init(SyntaxSet::load_defaults_newlines);
    let syntax = ss
        .find_syntax_by_token(lang)
        .unwrap_or_else(|| ss.find_syntax_plain_text());
    let mut parse = ParseState::new(syntax);
    let mut stack = ScopeStack::new();
    let mut out = String::with_capacity(code.len() * 4);
    for (i, line) in LinesWithEndings::from(code).enumerate() {
        let ops = parse.parse_line(line, ss).unwrap_or_default();
        let carried: Vec<_> = stack.as_slice().to_vec();
        let cls = if hl.contains(&(i + 1)) { "cl hl" } else { "cl" };
        out.push_str(&format!("<span class=\"{cls}\">"));
        // Reopen the scopes carried over from earlier lines (closed at the prev line end).
        // `ClassStyle::Spaced` classes are the scope path with dots → spaces (e.g.
        // `source.rust` → `source rust`), which is exactly `Scope`'s Display form.
        for scope in &carried {
            let classes = scope.to_string().replace('.', " ");
            out.push_str(&format!("<span class=\"{classes}\">"));
        }
        let (tokens, _) =
            line_tokens_to_classed_spans(line, ops.as_slice(), ClassStyle::Spaced, &mut stack)
                .unwrap_or_else(|_| (String::new(), 0));
        out.push_str(tokens.trim_end_matches('\n'));
        // Close every span still open after this line (carried + net opened here).
        out.push_str(&"</span>".repeat(stack.len()));
        out.push_str("</span>");
    }
    out
}

/// The stylesheet that colours the class-tagged code spans: the light theme by
/// default, and the dark theme under `[data-theme="dark"]` (dormant until the viewer
/// sets that hook). Generated from syntect so it always matches the classes the
/// [`highlighter`] emits. Regenerate with `cargo run -p khb-core --example syntax-css`.
pub fn syntax_theme_css() -> String {
    use syntect::highlighting::ThemeSet;
    use syntect::html::{css_for_theme_with_class_style, ClassStyle};

    let themes = ThemeSet::load_defaults();
    let css = |name: &str| {
        css_for_theme_with_class_style(&themes.themes[name], ClassStyle::Spaced)
            .expect("bundled syntect theme dumps to CSS")
    };
    // The dark rules are nested under the hook (native CSS nesting) so they only
    // apply when the viewer opts into dark mode; light stays the default.
    format!(
        "/* Generated — see markdown::syntax_theme_css. Do not edit by hand. */\n\
         {light}\n\
         [data-theme=\"dark\"] {{\n{dark}\n}}\n",
        light = css(THEME_LIGHT),
        dark = css(THEME_DARK),
    )
}

/// Render Markdown to HTML with a GFM-flavoured feature set (tables, strikethrough,
/// autolinks, task lists, footnotes). With `Some(highlighter)`, fenced code blocks
/// that declare a language are syntax-highlighted (CSS classes — see [`highlighter`]).
/// With `None`, code is rendered plain — used for the `plain` text extraction, so
/// token-splitting spans don't pollute the search text. Raw inline HTML is escaped,
/// not passed through — authored content is Markdown, and docsets may come from
/// untrusted sources.
pub fn render_html(markdown: &str, highlighter: Option<&SyntectAdapter>) -> String {
    let mut options = Options::default();
    options.extension.table = true;
    options.extension.strikethrough = true;
    options.extension.autolink = true;
    options.extension.tasklist = true;
    options.extension.footnotes = true;
    // Give every heading a stable `id` (empty prefix → the heading text slug) plus a
    // permalink anchor, so pages can be deep-linked to a section. The viewer resolves
    // a `#slug` that matches a heading on the current page as an in-page scroll, and
    // only a `#id` with no local match as a cross-page link (see rewriteFrameLinks).
    options.extension.header_id_prefix = Some(String::new());
    // `:shortcode:` emoji, e.g. `:tada:` → 🎉.
    options.extension.shortcodes = true;
    // GitHub-style callouts: `> [!NOTE]` → a labelled `markdown-alert` block.
    options.extension.alerts = true;
    // `$…$` / `$$…$$` math (parsed to LaTeX; rendered to MathML in [`crate::render`]).
    options.extension.math_dollars = true;
    // Math also via code syntax: `` $`x`$ `` inline and ```math blocks — comrak emits
    // the same `data-math-style` marker, converted to MathML alongside `$…$`.
    options.extension.math_code = true;
    // Inline text marks. `==x==` → <mark> (already styled), `++x++` → <ins>, `x^2^` →
    // <sup>, `~x~` → <sub> (double `~~` stays strikethrough — comrak distinguishes by
    // tilde count), `__x__` → <u> (bold is `**`, so `__` is free), `||x||` → a spoiler.
    options.extension.highlight = true;
    options.extension.insert = true;
    options.extension.superscript = true;
    options.extension.subscript = true;
    options.extension.underline = true;
    options.extension.spoiler = true;
    // Description/definition lists (`Term` / `: details`) and inline footnotes (`^[…]`,
    // sharing the footnote numbering already enabled above).
    options.extension.description_lists = true;
    options.extension.inline_footnotes = true;
    // Keep the info-string text *after* the language on the `<code>` as `data-meta`,
    // so ```ts [nuxt.config.ts] surfaces a filename the viewer shows above the block.
    options.render.full_info_string = true;
    // `![alt](url "caption")` → <figure><figcaption>caption</figcaption>.
    options.render.figure_with_caption = true;

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
    fn enables_the_inline_mark_extensions() {
        let html = render_html("==h== ++i++ x^2^ H~2~O ~~d~~ __u__ ||s||", None);
        assert!(html.contains("<mark>h</mark>"));
        assert!(html.contains("<ins>i</ins>"));
        assert!(html.contains("<sup>2</sup>"));
        assert!(html.contains("<sub>2</sub>")); // single ~ → subscript
        assert!(html.contains("<del>d</del>")); // double ~~ → strikethrough (coexists)
        assert!(html.contains("<u>u</u>")); // __ → underline (bold is **)
        assert!(html.contains("class=\"spoiler\">s</span>"));
    }

    #[test]
    fn enables_figures_and_description_lists() {
        assert!(render_html("![a](x.png \"cap\")", None).contains("<figcaption>cap</figcaption>"));
        let dl = render_html("Term\n: Details\n", None);
        assert!(dl.contains("<dt>Term</dt>") && dl.contains("<dd>Details</dd>"));
    }

    #[test]
    fn highlights_a_fenced_code_block() {
        let src = "```rust\nlet x = 1;\n```\n";
        let hl = highlighter();
        // With a highlighter: class-tagged spans (no inline colours — those come from
        // the injected theme CSS), wrapped in the `syntax-highlighting` <pre>.
        let hot = render_html(src, Some(&hl));
        assert!(hot.contains("class=\"syntax-highlighting\""));
        assert!(hot.contains("<span class="), "tokens carry scope classes");
        assert!(
            !hot.contains("style=\"color:"),
            "no baked-in inline colours"
        );
        // Without one (the plain path): code text stays intact, no span artifacts.
        let cold = render_html(src, None);
        assert!(html_to_plain(&cold).contains("let x = 1;"));
    }

    #[test]
    fn syntax_css_defines_light_and_a_dark_hook() {
        let css = syntax_theme_css();
        assert!(css.contains("[data-theme=\"dark\"]"), "dark theme is gated");
        // A common scope class both themes colour.
        assert!(css.contains(".comment"));
    }
}
