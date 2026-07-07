//! Generate the `llms.txt` family from opened docsets — the static, AI-facing
//! counterpart to the (server-bound) MCP endpoint.
//!
//! Three artifacts, all derived from each docset's TOC + the optional `md` column
//! (falling back to `plain` when a page has no Markdown):
//! - **`llms.txt`** — a link index: an `H1` title, a summary, then one `H2` section
//!   per book listing its pages as `- [title](md/…): description`.
//! - **`llms-full.txt`** — every page's Markdown concatenated, for one-shot ingestion.
//! - **per-page `md/<docset>/<page>.md`** — clean Markdown a consumer can fetch singly.
//!
//! Pure content transformation (no I/O beyond querying the readers), so it works on
//! any `.khb` and needs no network. `khb pack --llms` writes the result into a
//! distribution; a static host serves it as-is (unlike MCP, which needs a backend).

use std::collections::HashSet;

use anyhow::Result;

use crate::docset::Docset;

/// One per-page Markdown file: its path under the dist root and its content.
pub struct LlmsPage {
    pub path: String,
    pub content: String,
}

/// The full `llms.txt` export for a distribution.
pub struct LlmsExport {
    /// `llms.txt` — the link index.
    pub index: String,
    /// `llms-full.txt` — all page bodies concatenated.
    pub full: String,
    /// Per-page Markdown files (`md/<docset>/<page>.md`).
    pub pages: Vec<LlmsPage>,
}

/// Build the export from opened docsets. `site_title` names the whole set; when
/// `None`, it defaults to the single book's title (or "Documentation" for several).
pub fn export(docsets: &[&Docset], site_title: Option<&str>) -> Result<LlmsExport> {
    // A language tag is only worth showing when the set actually mixes languages.
    let mut langs = HashSet::new();
    for ds in docsets {
        langs.insert(ds.language()?);
    }
    let multilingual = langs.len() > 1;

    let title = match site_title {
        Some(t) => t.to_string(),
        None => match docsets {
            [only] => only
                .meta("title")?
                .unwrap_or_else(|| only.id().unwrap_or_default()),
            _ => "Documentation".to_string(),
        },
    };

    let mut index = String::new();
    let mut full = String::new();
    let mut pages = Vec::new();
    let mut total = 0usize;

    // First pass to count pages, so the summary lines can state the total up front.
    let mut books = Vec::new();
    for ds in docsets {
        let id = ds.id()?;
        let book_title = ds.meta("title")?.unwrap_or_else(|| id.clone());
        let lang = ds.language()?;
        let ordered = ordered_pages(ds)?;
        total += ordered.len();
        books.push((ds, id, book_title, lang, ordered));
    }

    index.push_str(&format!("# {title}\n\n"));
    index.push_str(&format!(
        "> Documentation exported for language models by KD Help Book — {total} page(s) across {} book(s). \
         Each link points at a clean-Markdown copy; `llms-full.txt` has everything inline.\n",
        books.len()
    ));

    full.push_str(&format!("# {title}\n\n"));
    full.push_str(&format!(
        "> Full text of {total} page(s) across {} book(s), for language-model ingestion.\n",
        books.len()
    ));

    for (ds, id, book_title, lang, ordered) in &books {
        let heading = if multilingual {
            format!("{book_title} ({})", lang.to_uppercase())
        } else {
            book_title.clone()
        };
        index.push_str(&format!("\n## {heading}\n\n"));

        // Valid page ids in this book: a `#anchor` link is rewritten to a `.md` path
        // only when it names a real page, so genuine heading anchors are left alone.
        let page_ids: HashSet<String> = ordered.iter().map(|(pid, _)| pid.clone()).collect();
        let md_prefix = format!("md/{}/", sanitize(id));

        for (page_id, page_title) in ordered {
            let body = page_content(ds, page_id)?;
            let rel = format!("{md_prefix}{}.md", sanitize(page_id));

            // The index description flattens links to text, so derive it from the
            // original body (before link rewriting).
            let mut line = format!("- [{}]({rel})", escape_link_text(page_title));
            if let Some(desc) = describe(&body) {
                line.push_str(&format!(": {desc}"));
            }
            index.push_str(&line);
            index.push('\n');

            // Rewrite links per surface: from a standalone page file, a same-book link
            // is a sibling `<page>.md`; from the root-level llms-full.txt it's
            // `md/<book>/<page>.md`. Both send `assets/…` to the `asset:` scheme.
            let full_body = rewrite_md_links(&body, &page_ids, &md_prefix);
            let page_body = rewrite_md_links(&body, &page_ids, "");

            full.push_str(&format!("\n<!-- {id}/{page_id} — {book_title} -->\n\n"));
            full.push_str(full_body.trim_end());
            full.push_str("\n\n---\n");

            pages.push(LlmsPage {
                path: rel,
                content: format!("{}\n", page_body.trim_end()),
            });
        }
    }

    Ok(LlmsExport { index, full, pages })
}

/// Page ids + display titles in reading order: a pre-order walk of the TOC, then any
/// pages missing from the TOC appended in storage order (so nothing is dropped).
fn ordered_pages(ds: &Docset) -> Result<Vec<(String, String)>> {
    use std::collections::HashMap;
    let toc = ds.toc()?;
    // `toc()` already yields entries in (roots-first, then per-parent) position order,
    // so bucketing by parent preserves each sibling group's order.
    let mut children: HashMap<Option<i64>, Vec<usize>> = HashMap::new();
    for (i, e) in toc.iter().enumerate() {
        children.entry(e.parent_id).or_default().push(i);
    }

    let mut out = Vec::new();
    let mut seen = HashSet::new();
    // Explicit stack, pushing siblings reversed so they pop back in order.
    let mut stack: Vec<usize> = children
        .get(&None)
        .map(|v| v.iter().rev().copied().collect())
        .unwrap_or_default();
    while let Some(i) = stack.pop() {
        let e = &toc[i];
        // A folder node (no page) contributes nothing itself; its children still
        // land in reading order.
        if let Some(page_id) = &e.page_id {
            if seen.insert(page_id.clone()) {
                out.push((page_id.clone(), e.title.clone()));
            }
        }
        if let Some(kids) = children.get(&Some(e.id)) {
            for &k in kids.iter().rev() {
                stack.push(k);
            }
        }
    }

    // Orphans — pages not reachable from the TOC — keep the export complete.
    for (id, title) in ds.page_index()? {
        if seen.insert(id.clone()) {
            out.push((id, title));
        }
    }
    Ok(out)
}

/// A page's body as Markdown: the stored `md`, else the plain-text fallback.
fn page_content(ds: &Docset, id: &str) -> Result<String> {
    if let Some(md) = ds.page_markdown(id)? {
        return Ok(md);
    }
    Ok(ds.page_plain(id)?.unwrap_or_default())
}

/// A one-line description for the index: the first prose line of the body, with
/// inline Markdown flattened and truncated. `None` when there's no prose.
fn describe(md: &str) -> Option<String> {
    for raw in md.lines() {
        let line = raw.trim();
        if line.is_empty() {
            continue;
        }
        // Skip non-prose lines: headings, images, tables, quotes, fences, raw HTML.
        let first = line.chars().next().unwrap();
        if matches!(first, '#' | '!' | '|' | '>' | '<') || line.starts_with("```") {
            continue;
        }
        // Drop a leading list/marker so a list item's text still counts as prose.
        let text = line.trim_start_matches(['-', '*', '+', ' ', '\t']);
        let flat = flatten_inline(text);
        let flat = flat.trim();
        if flat.is_empty() {
            continue;
        }
        return Some(truncate(flat, 120));
    }
    None
}

/// Flatten inline Markdown to plain text for a description: `[text](url)` → `text`,
/// and drop emphasis/code markers. Best-effort, single line.
fn flatten_inline(s: &str) -> String {
    let mut out = String::new();
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            // [text](url) or [text][ref] → text
            '[' => {
                let mut text = String::new();
                for c in chars.by_ref() {
                    if c == ']' {
                        break;
                    }
                    text.push(c);
                }
                // Skip a following (…) or […] target if present.
                if matches!(chars.peek(), Some('(') | Some('[')) {
                    let close = if chars.peek() == Some(&'(') { ')' } else { ']' };
                    chars.next();
                    for c in chars.by_ref() {
                        if c == close {
                            break;
                        }
                    }
                }
                out.push_str(&flatten_inline(&text));
            }
            // Emphasis / code markers: drop.
            '*' | '_' | '`' => {}
            _ => out.push(c),
        }
    }
    out
}

/// Truncate to at most `max` chars on a char boundary, appending `…` when cut.
fn truncate(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    // Trim a dangling partial word for tidiness.
    if let Some(sp) = out.rfind(' ') {
        if sp > max / 2 {
            out.truncate(sp);
        }
    }
    out.push('…');
    out
}

/// Escape `]` in link text so it can't break the `[text](url)` syntax.
fn escape_link_text(s: &str) -> String {
    s.replace('[', "\\[").replace(']', "\\]")
}

/// Make a path component filesystem- and URL-safe (ids are slugs, but be defensive).
fn sanitize(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-') {
                c
            } else {
                '_'
            }
        })
        .collect()
}

/// Rewrite a page's Markdown links for the export, **leaving code untouched**:
/// a `[text](#page)` anchor to a real page becomes `[text]({page_prefix}<page>.md)`,
/// and `[text](assets/…)` becomes `[text](asset:assets/…)` (the same scheme
/// `body_html` uses). Fenced code blocks and inline code spans are copied verbatim —
/// the docs describe these very patterns in examples, which must not be rewritten.
fn rewrite_md_links(md: &str, page_ids: &HashSet<String>, page_prefix: &str) -> String {
    let mut out = String::with_capacity(md.len());
    let mut fence: Option<char> = None;
    for line in md.split_inclusive('\n') {
        match fence {
            // Inside a fenced block: copy verbatim until the matching fence closes it.
            Some(ch) => {
                out.push_str(line);
                if fence_marker(line) == Some(ch) {
                    fence = None;
                }
            }
            None => match fence_marker(line) {
                Some(ch) => {
                    fence = Some(ch);
                    out.push_str(line);
                }
                None => rewrite_line(line, page_ids, page_prefix, &mut out),
            },
        }
    }
    out
}

/// The fence character if this line is a code fence (≥3 leading `` ` `` or `~`).
fn fence_marker(line: &str) -> Option<char> {
    let t = line.trim_start();
    ['`', '~']
        .into_iter()
        .find(|&ch| t.chars().take_while(|&c| c == ch).count() >= 3)
}

/// Rewrite link targets on one non-fenced line, skipping inline code spans.
fn rewrite_line(line: &str, page_ids: &HashSet<String>, page_prefix: &str, out: &mut String) {
    let chars: Vec<char> = line.chars().collect();
    let mut i = 0;
    let mut code_run = 0usize; // backtick-run length of an open inline code span (0 = none)
    while i < chars.len() {
        let c = chars[i];
        if c == '`' {
            let run = chars[i..].iter().take_while(|&&c| c == '`').count();
            for _ in 0..run {
                out.push('`');
            }
            code_run = match code_run {
                0 => run,           // open a span
                n if n == run => 0, // a matching run closes it
                n => n,             // a different run inside the span: unchanged
            };
            i += run;
            continue;
        }
        // A `](target)` link, only when not inside inline code.
        if code_run == 0 && c == ']' && chars.get(i + 1) == Some(&'(') {
            if let Some(close) = chars[i + 2..].iter().position(|&c| c == ')') {
                let target: String = chars[i + 2..i + 2 + close].iter().collect();
                out.push_str("](");
                out.push_str(&rewrite_target(&target, page_ids, page_prefix));
                out.push(')');
                i += 2 + close + 1;
                continue;
            }
        }
        out.push(c);
        i += 1;
    }
}

/// Rewrite a single link target (URL + optional ` "title"`): a bare same-book
/// `page-id` becomes the page's `.md`, and an `assets/…` reference the `asset:`
/// scheme. A `#slug` in-page anchor and anything else (external, cross-book) is left.
fn rewrite_target(target: &str, page_ids: &HashSet<String>, page_prefix: &str) -> String {
    let (url, rest) = match target.find(char::is_whitespace) {
        Some(p) => (&target[..p], &target[p..]),
        None => (target, ""),
    };
    if url.starts_with('#') {
        // In-page heading anchor — valid Markdown as-is.
        target.to_string()
    } else if url.starts_with("assets/") {
        format!("asset:{url}{rest}")
    } else if page_ids.contains(url) {
        // A bare page id in this book → the page's Markdown file.
        format!("{page_prefix}{}.md{rest}", sanitize(url))
    } else {
        target.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrites_prose_links_but_leaves_code_verbatim() {
        let ids: HashSet<String> = ["adv"].iter().map(|s| s.to_string()).collect();
        let md = "\
See [advanced](adv) and the ![logo](assets/logo.svg).
Jump to [Setup](#setup) — an in-page anchor.
Inline `[x](adv)` and `assets/y` stay.
```
[x](adv) links and assets/y paths stay in code
```
A [missing](nope) page and [ext](https://x) stay.
";
        // Standalone page file: a bare same-book id becomes a sibling `.md`.
        let page = rewrite_md_links(md, &ids, "");
        assert!(page.contains("[advanced](adv.md)"));
        assert!(page.contains("![logo](asset:assets/logo.svg)"));
        assert!(page.contains("[Setup](#setup)")); // in-page anchor → left
        assert!(page.contains("Inline `[x](adv)` and `assets/y` stay.")); // inline code
        assert!(page.contains("[x](adv) links and assets/y paths stay in code")); // fenced
        assert!(page.contains("[missing](nope)")); // not a real page → left
        assert!(page.contains("[ext](https://x)")); // external → left

        // llms-full.txt lives at the root, so links are `md/<book>/…`.
        let full = rewrite_md_links(md, &ids, "md/demo/");
        assert!(full.contains("[advanced](md/demo/adv.md)"));
        assert!(full.contains("![logo](asset:assets/logo.svg)"));
    }
}
