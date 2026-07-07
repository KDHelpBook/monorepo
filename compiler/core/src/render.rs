//! Rendering: [`SourceDocset`] (Markdown) → [`RenderedDocset`] (HTML + plain text).
//!
//! This is where Markdown is turned into HTML, **once**, at build time.

use anyhow::{Context, Result};
use comrak::plugins::syntect::SyntectAdapter;

use crate::model::{RenderedDocset, RenderedPage, SourceDocset};
use crate::{assets, markdown};

/// Render every page's Markdown to HTML and derive its plain-text form. Fails if a
/// page contains math the LaTeX→MathML converter can't parse (a build error beats a
/// silently broken formula).
pub fn render(src: &SourceDocset) -> Result<RenderedDocset> {
    // One highlighter for the whole docset — building it loads syntect's syntax +
    // theme sets, which we don't want to repeat per page.
    let highlighter = markdown::highlighter();
    let pages = src
        .pages
        .iter()
        .map(|p| -> Result<RenderedPage> {
            // Render Markdown, expand `~~~code-group` (tabs) and `~~~code-preview`
            // (command + terminal output) blocks, rewrite `assets/…` targets to the
            // `asset:` scheme, and finally render `$…$` LaTeX spans to MathML.
            // The closure only captures `&p.id`, so it is `Copy` — passed by value
            // each time (clippy: needless_borrows_for_generic_args).
            let ctx = || format!("page `{}`", p.id);
            let html = markdown::render_html(&p.markdown, Some(&highlighter));
            let html = render_code_groups(&html, &highlighter).with_context(ctx)?;
            let html = render_code_preview(&html, &highlighter).with_context(ctx)?;
            let html = render_code_tree(&html, &highlighter).with_context(ctx)?;
            // ` ```dot ` / ` ```graphviz ` → a Graphviz graph laid out to inline SVG at
            // build time (pure-Rust `layout`). Fails the build on unparseable DOT.
            let html = render_diagrams(&html).with_context(ctx)?;
            let html = render_line_highlight(&html);
            // `` `x`{:lang} `` → inline-highlighted code; `` `x`{.badge} `` → a badge.
            let html = render_inline_attrs(&html);
            let html = assets::rewrite_asset_urls(&html);
            let html = render_math(&html).with_context(ctx)?;
            // `:::tabs` / `:::tab` → an interactive tabbed panel. Runs last so each tab's
            // body already has its code blocks, math, and callouts rendered.
            let rendered = render_tabs(&html);
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
            Ok(RenderedPage {
                id: p.id.clone(),
                title: p.title.clone(),
                body_html,
                plain,
                keywords: p.keywords.clone(),
                categories: p.categories.clone(),
                related: p.related.clone(),
                // Carry the clean source Markdown (post-frontmatter) for llms.txt / MCP.
                md: Some(p.markdown.clone()),
            })
        })
        .collect::<Result<Vec<_>>>()?;

    Ok(RenderedDocset {
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
    })
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

/// Replace comrak's math markers with native MathML, rendered at build time so the
/// viewer needs no KaTeX/MathJax. Handles both `math_dollars` (`<span data-math-style>`)
/// and `math_code` (`<code data-math-style>` inline, and `<pre><code … data-math-style>`
/// for a ```math block). Fails on a formula the converter can't parse — a build error
/// beats a silently broken formula.
fn render_math(html: &str) -> Result<String> {
    use latex2mathml::{latex_to_mathml, DisplayStyle};
    const ATTR: &str = "data-math-style=\"";
    let mut out = String::with_capacity(html.len());
    let mut i = 0;
    while let Some(rel) = html[i..].find(ATTR) {
        let attr = i + rel;
        // The enclosing element is the nearest `<` before the attribute (`<span`/`<code`).
        let Some(tag_off) = html[i..attr].rfind('<') else {
            break;
        };
        let tag = i + tag_off;
        let is_code = html[tag..].starts_with("<code");
        let close: &str = if is_code { "</code>" } else { "</span>" };
        // A ```math block is `<pre><code … data-math-style="display">…</code></pre>`.
        let block_pre = is_code && html[i..tag].ends_with("<pre>");
        let sv = attr + ATTR.len();
        let Some(qrel) = html[sv..].find('"') else {
            break;
        };
        let style = &html[sv..sv + qrel];
        let Some(gtrel) = html[sv + qrel..].find('>') else {
            break;
        };
        let latex_start = sv + qrel + gtrel + 1; // just past the tag's `>`
        let Some(crel) = html[latex_start..].find(close) else {
            break;
        };
        let latex = unescape_html(html[latex_start..latex_start + crel].trim_end_matches('\n'));
        let display = if style == "display" {
            DisplayStyle::Block
        } else {
            DisplayStyle::Inline
        };
        let mathml = latex_to_mathml(&latex, display)
            .map_err(|e| anyhow::anyhow!("invalid math `{latex}`: {e}"))?;
        // Drop the whole element: `<pre>…</pre>` for a block, else the `<span>`/`<code>`.
        let elem_start = if block_pre { tag - "<pre>".len() } else { tag };
        let mut elem_end = latex_start + crel + close.len();
        if block_pre && html[elem_end..].starts_with("</pre>") {
            elem_end += "</pre>".len();
        }
        out.push_str(&html[i..elem_start]);
        out.push_str(&mathml);
        i = elem_end;
    }
    out.push_str(&html[i..]);
    Ok(out)
}

/// Expand `~~~code-group … ~~~` blocks into a tabbed group. comrak renders the outer
/// fence as one opaque `language-code-group` block whose body is the inner ```` ``` ````
/// fences as plain text; we split those out, re-render each through the normal
/// highlighter path (so panels get real syntect highlighting, minus the `[label]`,
/// which becomes the tab), and emit `.code-group` markup the viewer makes interactive.
/// A group with no inner code blocks is a build error.
fn render_code_groups(html: &str, highlighter: &SyntectAdapter) -> Result<String> {
    const OPEN: &str = "<pre class=\"syntax-highlighting\"><code class=\"language-code-group\">";
    const CLOSE: &str = "</code></pre>";
    let mut out = String::with_capacity(html.len());
    let mut i = 0;
    while let Some(rel) = html[i..].find(OPEN) {
        let start = i + rel;
        let inner_start = start + OPEN.len();
        let Some(end_rel) = html[inner_start..].find(CLOSE) else {
            break;
        };
        // The opaque block's body is plaintext-highlighted: strip syntect's `<span>`s
        // and decode entities to recover the verbatim inner fences.
        let raw = unescape_html(&strip_tags(&html[inner_start..inner_start + end_rel]));
        let blocks = split_group_fences(&raw);
        if blocks.is_empty() {
            anyhow::bail!("`~~~code-group` contains no code blocks");
        }
        let mut tabs = String::new();
        let mut panels = String::new();
        for (idx, (info, code)) in blocks.iter().enumerate() {
            let (lang, label) = parse_code_info(info);
            let tab = if !label.is_empty() {
                label
            } else if !lang.is_empty() {
                lang.clone()
            } else {
                (idx + 1).to_string()
            };
            let active = if idx == 0 { " active" } else { "" };
            tabs.push_str(&format!(
                "<button class=\"code-group-tab{active}\" type=\"button\" data-group-tab=\"{idx}\">{}</button>",
                esc(&tab)
            ));
            // Re-render the panel without the `[label]` so the viewer draws no filename
            // bar inside it (the label is the tab); it still gets a floating Copy button.
            let panel_md = if lang.is_empty() {
                format!("```\n{code}\n```")
            } else {
                format!("```{lang}\n{code}\n```")
            };
            let panel_html = markdown::render_html(&panel_md, Some(highlighter));
            panels.push_str(&format!(
                "<div class=\"code-group-panel{active}\" data-group-panel=\"{idx}\">{}</div>",
                panel_html.trim()
            ));
        }
        out.push_str(&html[i..start]);
        out.push_str(&format!(
            "<div class=\"code-group\"><div class=\"code-group-tabs\" role=\"tablist\">{tabs}</div>{panels}</div>"
        ));
        i = inner_start + end_rel + CLOSE.len();
    }
    out.push_str(&html[i..]);
    Ok(out)
}

/// Expand `~~~code-preview … ~~~`: the first inner fence is a command (re-rendered with
/// syntax highlighting), the second is its output, shown in a terminal-styled panel.
/// Same opaque-block mechanism as [`render_code_groups`]. Missing either block is a
/// build error.
fn render_code_preview(html: &str, highlighter: &SyntectAdapter) -> Result<String> {
    const OPEN: &str = "<pre class=\"syntax-highlighting\"><code class=\"language-code-preview\">";
    const CLOSE: &str = "</code></pre>";
    let mut out = String::with_capacity(html.len());
    let mut i = 0;
    while let Some(rel) = html[i..].find(OPEN) {
        let start = i + rel;
        let inner_start = start + OPEN.len();
        let Some(end_rel) = html[inner_start..].find(CLOSE) else {
            break;
        };
        let raw = unescape_html(&strip_tags(&html[inner_start..inner_start + end_rel]));
        let blocks = split_group_fences(&raw);
        if blocks.len() < 2 {
            anyhow::bail!("`~~~code-preview` needs a command block and an output block");
        }
        let (cmd_info, cmd_code) = &blocks[0];
        let (_out_info, out_code) = &blocks[1];
        let (lang, _) = parse_code_info(cmd_info);
        let cmd_md = if lang.is_empty() {
            format!("```\n{cmd_code}\n```")
        } else {
            format!("```{lang}\n{cmd_code}\n```")
        };
        let cmd_html = markdown::render_html(&cmd_md, Some(highlighter));
        out.push_str(&html[i..start]);
        out.push_str(&format!(
            "<div class=\"code-preview\"><div class=\"code-preview-cmd\">{}</div>\
             <div class=\"code-terminal\"><div class=\"code-terminal-bar\" aria-hidden=\"true\">\
             <span></span><span></span><span></span></div><pre class=\"code-terminal-out\">{}</pre></div></div>",
            cmd_html.trim(),
            esc(out_code)
        ));
        i = inner_start + end_rel + CLOSE.len();
    }
    out.push_str(&html[i..]);
    Ok(out)
}

/// A folder in a [`render_code_tree`] file tree: ordered subfolders + files (each a
/// block index), built by inserting each `[path]` segment by segment.
#[derive(Default)]
struct Dir {
    dirs: Vec<(String, Dir)>,
    files: Vec<(String, usize)>,
}

impl Dir {
    fn insert(&mut self, parts: &[&str], idx: usize) {
        match parts {
            [] => {}
            [name] => self.files.push(((*name).to_string(), idx)),
            [name, rest @ ..] => {
                if let Some((_, d)) = self.dirs.iter_mut().find(|(n, _)| n == name) {
                    d.insert(rest, idx);
                } else {
                    let mut d = Dir::default();
                    d.insert(rest, idx);
                    self.dirs.push(((*name).to_string(), d));
                }
            }
        }
    }

    fn render(&self, out: &mut String) {
        out.push_str("<ul class=\"tree-list\">");
        for (name, d) in &self.dirs {
            out.push_str(&format!(
                "<li class=\"tree-dir\"><span class=\"tree-dir-name\">{}</span>",
                esc(name)
            ));
            d.render(out);
            out.push_str("</li>");
        }
        for (name, idx) in &self.files {
            let active = if *idx == 0 { " active" } else { "" };
            out.push_str(&format!(
                "<li class=\"tree-file{active}\" data-tree-file=\"{idx}\">{}</li>",
                esc(name)
            ));
        }
        out.push_str("</ul>");
    }
}

/// Expand `~~~code-tree … ~~~`: each inner fence's `[path]` builds a file tree; clicking
/// a file shows its (highlighted) content in the panel. Same opaque-fence mechanism as
/// code-group; the viewer wires the file switching. No files is a build error.
fn render_code_tree(html: &str, highlighter: &SyntectAdapter) -> Result<String> {
    const OPEN: &str = "<pre class=\"syntax-highlighting\"><code class=\"language-code-tree\">";
    const CLOSE: &str = "</code></pre>";
    let mut out = String::with_capacity(html.len());
    let mut i = 0;
    while let Some(rel) = html[i..].find(OPEN) {
        let start = i + rel;
        let inner_start = start + OPEN.len();
        let Some(end_rel) = html[inner_start..].find(CLOSE) else {
            break;
        };
        let raw = unescape_html(&strip_tags(&html[inner_start..inner_start + end_rel]));
        let blocks = split_group_fences(&raw);
        if blocks.is_empty() {
            anyhow::bail!("`~~~code-tree` contains no files");
        }
        let mut tree = Dir::default();
        let mut panels = String::new();
        for (idx, (info, code)) in blocks.iter().enumerate() {
            let (lang, label) = parse_code_info(info);
            let path = if label.is_empty() {
                format!("file{}", idx + 1)
            } else {
                label
            };
            let mut parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
            if parts.is_empty() {
                parts.push(path.as_str());
            }
            tree.insert(&parts, idx);
            let panel_md = if lang.is_empty() {
                format!("```\n{code}\n```")
            } else {
                format!("```{lang}\n{code}\n```")
            };
            let panel_html = markdown::render_html(&panel_md, Some(highlighter));
            let active = if idx == 0 { " active" } else { "" };
            panels.push_str(&format!(
                "<div class=\"tree-panel{active}\" data-tree-panel=\"{idx}\">{}</div>",
                panel_html.trim()
            ));
        }
        let mut tree_html = String::new();
        tree.render(&mut tree_html);
        out.push_str(&html[i..start]);
        out.push_str(&format!(
            "<div class=\"code-tree\"><div class=\"code-tree-aside\">{tree_html}</div>\
             <div class=\"code-tree-main\">{panels}</div></div>"
        ));
        i = inner_start + end_rel + CLOSE.len();
    }
    out.push_str(&html[i..]);
    Ok(out)
}

/// Render ` ```dot ` / ` ```graphviz ` fenced blocks to inline SVG with the pure-Rust
/// `layout` engine — a static diagram baked in at build time, like math → MathML, so the
/// viewer needs no JS renderer and the SVG is sandbox-safe (no scripts / foreignObject).
/// comrak emits the fence as an opaque `language-dot` block; we recover its verbatim body
/// (strip syntect spans + decode entities) and lay it out. Unparseable DOT is a build error.
fn render_diagrams(html: &str) -> Result<String> {
    const PRE: &str = "<pre class=\"syntax-highlighting\"><code ";
    const CLOSE: &str = "</code></pre>";
    let mut out = String::with_capacity(html.len());
    let mut i = 0;
    while let Some(rel) = html[i..].find(PRE) {
        let block_start = i + rel;
        let attrs_start = block_start + PRE.len();
        let Some(gtrel) = html[attrs_start..].find('>') else {
            break;
        };
        let inner_start = attrs_start + gtrel + 1;
        let Some(crel) = html[inner_start..].find(CLOSE) else {
            break;
        };
        let lang = attr_value(&html[attrs_start..inner_start], "class")
            .and_then(|c| c.strip_prefix("language-").map(str::to_string));
        out.push_str(&html[i..block_start]);
        if matches!(lang.as_deref(), Some("dot") | Some("graphviz")) {
            let raw = unescape_html(&strip_tags(&html[inner_start..inner_start + crel]));
            let svg = render_dot(&raw)?;
            out.push_str(&format!("<figure class=\"diagram\">{svg}</figure>"));
        } else {
            out.push_str(&html[block_start..inner_start + crel + CLOSE.len()]);
        }
        i = inner_start + crel + CLOSE.len();
    }
    out.push_str(&html[i..]);
    Ok(out)
}

/// Lay out one DOT graph to an inline `<svg>` (XML prolog stripped). A parse error, or a
/// panic from the layout engine on a graph it can't handle, becomes a clean build error
/// rather than aborting the compile.
fn render_dot(dot: &str) -> Result<String> {
    use layout::backends::svg::SVGWriter;
    use layout::gv::{DotParser, GraphBuilder};

    // The layout engine panics on some inputs it parses but can't lay out; catch it (with
    // a silenced hook so no backtrace spills) and report it as a build error. render() is
    // sequential, so swapping the global panic hook here is safe.
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(|_| {}));
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| -> Result<String> {
        let mut parser = DotParser::new(dot);
        let graph = parser
            .process()
            .map_err(|e| anyhow::anyhow!("invalid DOT diagram: {e}"))?;
        let mut gb = GraphBuilder::new();
        gb.visit_graph(&graph);
        let mut svg = SVGWriter::new();
        gb.get().do_it(false, false, false, &mut svg);
        Ok(svg.finalize())
    }));
    std::panic::set_hook(prev);
    let svg = match result {
        Ok(inner) => inner?,
        Err(_) => anyhow::bail!("DOT diagram engine failed to lay out the graph"),
    };
    // Drop the `<?xml …?>` prolog so the SVG embeds inline cleanly.
    Ok(svg[svg.find("<svg").unwrap_or(0)..].to_string())
}

/// Apply the `{2,4-6}` line-highlight flag: for each highlighted code block whose
/// `data-meta` carries a `{…}` range, recover the raw code (strip syntect's spans +
/// decode entities) and re-highlight it line by line so the flagged lines can be tinted.
/// Blocks without a `{…}` range are left untouched.
fn render_line_highlight(html: &str) -> String {
    // comrak emits the code tag's attributes in either order — `<code data-meta="…"
    // class="language-…">` when there's meta, else `<code class="language-…">` — so
    // match `<code ` and read the code tag's own attributes (not the `<pre>` class).
    const PRE: &str = "<pre class=\"syntax-highlighting\"><code ";
    const CLOSE: &str = "</code></pre>";
    let mut out = String::with_capacity(html.len());
    let mut i = 0;
    while let Some(rel) = html[i..].find(PRE) {
        let block_start = i + rel;
        let attrs_start = block_start + PRE.len();
        let Some(gtrel) = html[attrs_start..].find('>') else {
            break;
        };
        let inner_start = attrs_start + gtrel + 1;
        let Some(crel) = html[inner_start..].find(CLOSE) else {
            break;
        };
        let code_attrs = &html[attrs_start..inner_start]; // just the `<code …>` attrs
        let lang = attr_value(code_attrs, "class")
            .and_then(|c| c.strip_prefix("language-").map(str::to_string));
        let ranges = attr_value(code_attrs, "data-meta").and_then(|m| parse_line_ranges(&m));

        out.push_str(&html[i..block_start]);
        match (lang, ranges) {
            (Some(lang), Some(rs)) => {
                let raw = unescape_html(&strip_tags(&html[inner_start..inner_start + crel]));
                out.push_str(&html[block_start..inner_start]); // keep the `<pre><code …>`
                out.push_str(&markdown::highlight_lines(&raw, &lang, &rs));
                out.push_str(CLOSE);
            }
            _ => out.push_str(&html[block_start..inner_start + crel + CLOSE.len()]),
        }
        i = inner_start + crel + CLOSE.len();
    }
    out.push_str(&html[i..]);
    out
}

/// Parse a `{2,4-6}` line-range spec out of a code fence's `data-meta`, into a set of
/// 1-based line numbers. `None` if there's no `{…}` (the block isn't line-highlighted).
fn parse_line_ranges(meta: &str) -> Option<std::collections::HashSet<usize>> {
    let open = meta.find('{')?;
    let close = meta[open..].find('}')? + open;
    let mut set = std::collections::HashSet::new();
    for part in meta[open + 1..close].split(',') {
        let part = part.trim();
        if let Some((a, b)) = part.split_once('-') {
            if let (Ok(a), Ok(b)) = (a.trim().parse::<usize>(), b.trim().parse::<usize>()) {
                (a..=b).for_each(|n| {
                    set.insert(n);
                });
            }
        } else if let Ok(n) = part.parse::<usize>() {
            set.insert(n);
        }
    }
    (!set.is_empty()).then_some(set)
}

/// Apply inline-code attributes: an inline `` `code` `` immediately followed by `{…}`.
/// `{:lang}` syntax-highlights the code inline; `{.badge}` / `{.badge-KIND …}` turns it
/// into a badge `<span>`; other `.class`es are copied onto the `<code>`. A `{…}` not
/// directly touching the `</code>` (a stray brace in prose) is left alone.
fn render_inline_attrs(html: &str) -> String {
    const OPEN: &str = "<code>"; // bare inline code only — highlighted blocks carry a class
    const CLOSE: &str = "</code>";
    let mut out = String::with_capacity(html.len());
    let mut i = 0;
    while let Some(rel) = html[i..].find(OPEN) {
        let cstart = i + rel;
        let text_start = cstart + OPEN.len();
        let Some(crel) = html[text_start..].find(CLOSE) else {
            break;
        };
        let after = text_start + crel + CLOSE.len();
        // Only treat it as attributed when `{` touches the closing tag.
        if !html[after..].starts_with('{') {
            out.push_str(&html[i..after]);
            i = after;
            continue;
        }
        let Some(brace) = html[after..].find('}') else {
            out.push_str(&html[i..after]);
            i = after;
            continue;
        };
        let attrs = &html[after + 1..after + brace];
        let text = &html[text_start..text_start + crel]; // comrak-escaped code text
        out.push_str(&html[i..cstart]);
        out.push_str(&render_code_attr(text, attrs));
        i = after + brace + 1;
    }
    out.push_str(&html[i..]);
    out
}

/// Render one attributed inline-code span (see [`render_inline_attrs`]). `text` is the
/// code as comrak escaped it; `attrs` is the raw `{…}` body without the braces.
fn render_code_attr(text: &str, attrs: &str) -> String {
    let attrs = attrs.trim();
    // `{:lang}` — inline syntax highlight (Shiki-style shorthand).
    if let Some(lang) = attrs.strip_prefix(':') {
        let lang = lang.trim();
        let spans = markdown::highlight_inline(&unescape_html(text), lang);
        return format!("<code class=\"language-{}\">{spans}</code>", esc(lang));
    }
    // `{.foo .bar}` — dotted class tokens. A `badge*` class makes it a badge span.
    let classes: Vec<&str> = attrs
        .split_whitespace()
        .filter_map(|t| t.strip_prefix('.'))
        .filter(|t| !t.is_empty())
        .collect();
    if classes.iter().any(|c| c.starts_with("badge")) {
        let mut cls = vec!["badge"];
        cls.extend(classes.iter().filter(|c| **c != "badge").copied());
        return format!("<span class=\"{}\">{text}</span>", esc(&cls.join(" ")));
    }
    if !classes.is_empty() {
        return format!("<code class=\"{}\">{text}</code>", esc(&classes.join(" ")));
    }
    format!("<code>{text}</code>") // unrecognised attr → plain inline code
}

/// Expand `:::tabs` containers (comrak `block_directive` → `<div class="tabs">` wrapping
/// `<div class="tab LABEL">` children) into an interactive tabbed panel the frame bridge
/// drives. The label is the directive name's trailing words; each panel keeps its already
/// rendered body. A `.tabs` with no `.tab` children is left untouched.
fn render_tabs(html: &str) -> String {
    const OPEN: &str = "<div class=\"tabs\">";
    let mut out = String::with_capacity(html.len());
    let mut i = 0;
    while let Some(rel) = html[i..].find(OPEN) {
        let start = i + rel;
        let Some((inner_start, inner_end, after)) = div_span(html, start) else {
            break;
        };
        let tabs = parse_tab_children(&html[inner_start..inner_end]);
        out.push_str(&html[i..start]);
        if tabs.is_empty() {
            out.push_str(&html[start..after]); // not a tab set — leave as a plain div
        } else {
            out.push_str(&build_tabs_widget(&tabs));
        }
        i = after;
    }
    out.push_str(&html[i..]);
    out
}

/// The span of the `<div …>` whose opening tag starts at `open`: `(inner_start, inner_end,
/// after_close)`, tracking nested `<div>`s. `None` if it's unbalanced (truncated input).
fn div_span(html: &str, open: usize) -> Option<(usize, usize, usize)> {
    let gt = open + html[open..].find('>')? + 1;
    let mut depth = 1usize;
    let mut j = gt;
    while j < html.len() {
        if html[j..].starts_with("<div") {
            depth += 1;
            j += 4;
        } else if html[j..].starts_with("</div>") {
            depth -= 1;
            if depth == 0 {
                return Some((gt, j, j + "</div>".len()));
            }
            j += "</div>".len();
        } else {
            j += 1;
        }
    }
    None
}

/// Parse the top-level `<div class="tab …">` children of a `.tabs` container's inner HTML
/// into `(label, body_html)`. `tab` with no label yields an empty label; a nested `tabs`
/// div (`class="tabs"`) is skipped over, not mistaken for a tab.
fn parse_tab_children(inner: &str) -> Vec<(String, String)> {
    const TAB: &str = "<div class=\"tab";
    let mut out = Vec::new();
    let mut j = 0;
    while let Some(rel) = inner[j..].find(TAB) {
        let d = j + rel;
        // Distinguish `tab`/`tab …` from `tabs`: the char after "tab" must close the
        // word (`"`) or start a label (space).
        let next = inner[d + TAB.len()..].chars().next();
        let Some((is, ie, after)) = div_span(inner, d) else {
            break;
        };
        if matches!(next, Some('"') | Some(' ')) {
            let cls = attr_value(&inner[d..is], "class").unwrap_or_default();
            let label = cls.split_whitespace().skip(1).collect::<Vec<_>>().join(" ");
            out.push((label, inner[is..ie].trim().to_string()));
        }
        j = after; // skip the whole child (nested tabs included) — top-level only
    }
    out
}

/// Assemble the tab bar + panels from `(label, body)` pairs; the first tab starts active.
/// The label is already comrak-escaped (it came from the div's `class`), so it is not
/// re-escaped. The frame bridge's `tabSwitch` toggles `.active` by index.
fn build_tabs_widget(tabs: &[(String, String)]) -> String {
    let mut bar = String::new();
    let mut panels = String::new();
    for (idx, (label, body)) in tabs.iter().enumerate() {
        let active = if idx == 0 { " active" } else { "" };
        let label = if label.is_empty() {
            format!("Tab {}", idx + 1)
        } else {
            label.clone()
        };
        bar.push_str(&format!(
            "<button class=\"tab-btn{active}\" type=\"button\" data-tab=\"{idx}\">{label}</button>"
        ));
        // Recurse so a `:::tabs` nested inside this tab is expanded too.
        let body = render_tabs(body);
        panels.push_str(&format!(
            "<div class=\"tab-panel{active}\" data-tab-panel=\"{idx}\">{body}</div>"
        ));
    }
    format!(
        "<div class=\"tabs\"><div class=\"tabs-bar\" role=\"tablist\">{bar}</div>{panels}</div>"
    )
}

/// Split a code-group's raw body into `(info-string, code)` per inner ```` ``` ```` fence.
fn split_group_fences(inner: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut lines = inner.lines();
    while let Some(line) = lines.next() {
        let t = line.trim_start();
        if t.starts_with("```") {
            let info = t.trim_start_matches('`').trim().to_string();
            let mut code: Vec<&str> = Vec::new();
            for l in lines.by_ref() {
                let tl = l.trim();
                if !tl.is_empty() && tl.chars().all(|c| c == '`') {
                    break; // closing fence
                }
                code.push(l);
            }
            out.push((info, code.join("\n")));
        }
    }
    out
}

/// Parse a code fence's info string into `(language, label)` — the language is the first
/// token, the label is the text inside `[…]` (used as the tab title).
fn parse_code_info(info: &str) -> (String, String) {
    let label = info
        .find('[')
        .and_then(|s| {
            info[s + 1..]
                .find(']')
                .map(|e| info[s + 1..s + 1 + e].trim().to_string())
        })
        .unwrap_or_default();
    let lang = info
        .split('[')
        .next()
        .unwrap_or("")
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_string();
    (lang, label)
}

/// Strip HTML tags (`<…>`) from a string, keeping text content and newlines.
fn strip_tags(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
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
        let out = render_math(html).unwrap();
        assert!(out.contains("<math") && out.contains("display=\"inline\""));
        assert!(out.contains("display=\"block\""));
        assert!(!out.contains("data-math-style")); // spans replaced
        assert!(out.contains("<p>x ") && out.contains(" y</p>")); // surrounding text kept
        assert!(out.contains("<msup>")); // a^2 → superscript

        // Unparseable LaTeX (here an unclosed environment) fails the build rather
        // than silently degrading to raw text.
        let bad = "<span data-math-style=\"inline\">\\begin{matrix}</span>";
        assert!(render_math(bad).is_err());

        // `math_code`: inline `<code data-math-style>` and a `<pre><code>` block are
        // both converted (and the surrounding `<pre>` dropped for the block).
        let code = "<p>x <code data-math-style=\"inline\">a^2</code></p>\
                    <pre><code class=\"language-math\" data-math-style=\"display\">a+b\n</code></pre>";
        let out = render_math(code).unwrap();
        assert!(out.contains("<math") && out.contains("display=\"inline\""));
        assert!(out.contains("display=\"block\""));
        assert!(!out.contains("data-math-style") && !out.contains("language-math"));
        assert!(!out.contains("<pre>")); // the block's <pre> wrapper is gone
    }

    #[test]
    fn expands_code_group() {
        let h = markdown::highlighter();
        let md = "~~~code-group\n```bash [npm]\nnpm i\n```\n```bash [pnpm]\npnpm add\n```\n~~~\n";
        let html = render_code_groups(&markdown::render_html(md, Some(&h)), &h).unwrap();
        assert!(html.contains("class=\"code-group\""));
        assert!(!html.contains("language-code-group")); // opaque block consumed
                                                        // Two tabs from the [labels]; the first tab + panel start active.
        assert!(html.contains("code-group-tab active"));
        assert!(html.contains(">npm</button>") && html.contains(">pnpm</button>"));
        assert!(html.contains("data-group-tab=\"1\""));
        assert!(html.contains("data-group-panel=\"0\"") && html.contains("data-group-panel=\"1\""));
        assert!(html.contains("language-bash")); // panels really highlighted
        assert!(!html.contains("[npm]")); // label became the tab, not a filename

        // A code-group with no inner fences is a build error.
        let empty = markdown::render_html("~~~code-group\n~~~\n", Some(&h));
        assert!(render_code_groups(&empty, &h).is_err());
    }

    #[test]
    fn expands_code_preview() {
        let h = markdown::highlighter();
        let md = "~~~code-preview\n```bash\nkhb compile src -o out.khb\n```\n```\ncompiled ok -> out.khb\n```\n~~~\n";
        let html = render_code_preview(&markdown::render_html(md, Some(&h)), &h).unwrap();
        assert!(html.contains("class=\"code-preview\""));
        assert!(!html.contains("language-code-preview")); // opaque block consumed
        assert!(html.contains("language-bash")); // command highlighted
        assert!(html.contains("class=\"code-terminal\"") && html.contains("code-terminal-out"));
        assert!(html.contains("compiled ok -&gt; out.khb")); // output escaped, not highlighted

        // A preview missing the output block fails the build.
        let one = markdown::render_html("~~~code-preview\n```bash\nls\n```\n~~~\n", Some(&h));
        assert!(render_code_preview(&one, &h).is_err());
    }

    #[test]
    fn expands_code_tree() {
        let h = markdown::highlighter();
        let md = "~~~code-tree\n```ts [src/index.ts]\nexport const x = 1;\n```\n```json [package.json]\n{}\n```\n```ts [src/util/add.ts]\nexport const add = 1;\n```\n~~~\n";
        let html = render_code_tree(&markdown::render_html(md, Some(&h)), &h).unwrap();
        assert!(html.contains("class=\"code-tree\""));
        assert!(!html.contains("language-code-tree")); // opaque block consumed
                                                       // Folders nest by `/`; files are leaves; first file's panel starts active.
        assert!(html.contains(">src<") && html.contains(">util<")); // folder names
        assert!(html.contains(">index.ts<") && html.contains(">package.json<"));
        assert!(html.contains("data-tree-file=\"0\"") && html.contains("tree-file active"));
        assert!(html.contains("data-tree-panel=\"2\"") && html.contains("language-json"));

        let empty = markdown::render_html("~~~code-tree\n~~~\n", Some(&h));
        assert!(render_code_tree(&empty, &h).is_err());
    }

    #[test]
    fn renders_dot_diagram() {
        let h = markdown::highlighter();
        let md = "```dot\ndigraph { A -> B; B -> C; }\n```\n";
        let out = render_diagrams(&markdown::render_html(md, Some(&h))).unwrap();
        assert!(out.contains("<figure class=\"diagram\"><svg"));
        assert!(!out.contains("language-dot")); // opaque block consumed
        assert!(!out.contains("<script") && !out.contains("<?xml")); // sandbox-safe, no prolog

        // A non-diagram code block is left untouched.
        let code = markdown::render_html("```rust\nlet x = 1;\n```\n", Some(&h));
        assert!(render_diagrams(&code).unwrap().contains("language-rust"));

        // Garbage that isn't a graph fails the build rather than rendering nothing.
        let bad = markdown::render_html("```dot\n@@@ not a graph @@@\n```\n", Some(&h));
        assert!(render_diagrams(&bad).is_err());
    }

    #[test]
    fn line_ranges_parse() {
        let r = parse_line_ranges("[main.rs] {2,4-6}").unwrap();
        assert!(r.contains(&2) && r.contains(&4) && r.contains(&5) && r.contains(&6));
        assert!(!r.contains(&3));
        assert!(parse_line_ranges("[main.rs]").is_none()); // no range → untouched
    }

    #[test]
    fn highlights_flagged_lines() {
        let h = markdown::highlighter();
        let md = "```rust {2}\nfn main() {\n    let x = 1;\n}\n```\n";
        let html = render_line_highlight(&markdown::render_html(md, Some(&h)));
        // Every line is wrapped in `.cl`; the flagged line (2) also gets `hl`.
        assert!(html.contains("class=\"cl hl\"")); // line 2 highlighted
        assert!(html.contains("class=\"cl\"")); // other lines wrapped, not highlighted
        assert!(html.contains("storage type rust")); // still syntax-highlighted (let)
                                                     // A block with no `{…}` range is left as-is (no `.cl` wrappers).
        let plain = markdown::render_html("```rust\nlet y = 2;\n```\n", Some(&h));
        assert!(!render_line_highlight(&plain).contains("class=\"cl\""));
    }

    #[test]
    fn inline_attrs_highlight_and_badge() {
        // `{:lang}` highlights the inline code and consumes the flag.
        let hl = render_inline_attrs("<p>Run <code>npm ci</code>{:bash} now.</p>");
        assert!(hl.contains("<code class=\"language-bash\">") && hl.contains("</code> now."));
        assert!(!hl.contains("{:bash}"));

        // `{.badge-green}` → a badge span that also carries the base `badge` class.
        let bd = render_inline_attrs("<p><code>Beta</code>{.badge-green} feature.</p>");
        assert!(bd.contains("<span class=\"badge badge-green\">Beta</span>"));
        assert!(!bd.contains("<code>Beta</code>"));

        // A brace not touching the `</code>` (a stray brace in prose) is left alone.
        let stray = render_inline_attrs("<p><code>x</code> {y}.</p>");
        assert!(stray.contains("<code>x</code> {y}."));
    }

    #[test]
    fn expands_tabs() {
        // Mimic comrak's block_directive output for `:::tabs` / `:::tab`.
        let html = "<div class=\"tabs\">\n<div class=\"tab macOS\">\n<p>brew</p>\n</div>\n\
                    <div class=\"tab Linux\">\n<p>apt</p>\n</div>\n</div>";
        let out = render_tabs(html);
        assert!(out.contains("class=\"tabs-bar\""));
        assert!(out.contains(">macOS</button>") && out.contains(">Linux</button>"));
        assert!(out.contains("data-tab=\"1\"") && out.contains("data-tab-panel=\"0\""));
        assert!(out.contains("tab-btn active") && out.contains("tab-panel active"));
        assert!(out.contains("<p>brew</p>") && out.contains("<p>apt</p>")); // bodies kept

        // A multi-word label joins the trailing class tokens; unlabeled → "Tab N".
        assert!(render_tabs(
            "<div class=\"tabs\"><div class=\"tab Windows 11\"><p>x</p></div></div>"
        )
        .contains(">Windows 11</button>"));
        assert!(
            render_tabs("<div class=\"tabs\"><div class=\"tab\"><p>x</p></div></div>")
                .contains(">Tab 1</button>")
        );

        // Nested tabs: the inner set expands and isn't mistaken for a tab of the outer.
        let nested = "<div class=\"tabs\"><div class=\"tab A\">\
                      <div class=\"tabs\"><div class=\"tab Inner\"><p>i</p></div></div>\
                      </div></div>";
        let no = render_tabs(nested);
        assert!(no.contains(">A</button>") && no.contains(">Inner</button>"));
        assert!(!no.contains(">Tab 1</button>")); // the inner `tabs` div isn't an unlabeled tab
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
