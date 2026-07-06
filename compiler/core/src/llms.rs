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
//! any `.khb` and needs no network. `kdhelp pack --llms` writes the result into a
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
        "> Documentation exported for language models by kdhelp — {total} page(s) across {} book(s). \
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

        for (page_id, page_title) in ordered {
            let body = page_content(ds, page_id)?;
            let rel = format!("md/{}/{}.md", sanitize(id), sanitize(page_id));

            let mut line = format!("- [{}]({rel})", escape_link_text(page_title));
            if let Some(desc) = describe(&body) {
                line.push_str(&format!(": {desc}"));
            }
            index.push_str(&line);
            index.push('\n');

            full.push_str(&format!("\n<!-- {id}/{page_id} — {book_title} -->\n\n"));
            full.push_str(body.trim_end());
            full.push_str("\n\n---\n");

            pages.push(LlmsPage {
                path: rel,
                content: format!("{}\n", body.trim_end()),
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
        if seen.insert(e.page_id.clone()) {
            out.push((e.page_id.clone(), e.title.clone()));
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
