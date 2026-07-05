//! Reader: open a `.khb` docset and query it.
//!
//! This is the query surface the viewer (via wasm) and Tauri (natively) both use.
//! It is read-only — writing/compiling is the job of [`crate::build`].

use std::path::Path;

use anyhow::{Context, Result};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};

use crate::model::{Category, RenderedDocset, RenderedPage, TocNode};

/// A page's renderable content.
#[derive(Debug, Clone)]
pub struct Page {
    pub id: String,
    pub title: String,
    pub body_html: String,
}

/// One node of the table-of-contents tree (flat; reconstruct the tree from
/// `parent_id` + `position`).
#[derive(Debug, Clone)]
pub struct TocEntry {
    pub id: i64,
    pub page_id: String,
    pub parent_id: Option<i64>,
    pub position: i64,
    pub title: String,
}

/// A keyword and the pages it points at (the F1 index).
#[derive(Debug, Clone)]
pub struct KeywordEntry {
    pub term: String,
    pub page_ids: Vec<String>,
}

/// A single full-text search result. `score` is higher-is-better (negated bm25).
#[derive(Debug, Clone)]
pub struct SearchHit {
    pub page_id: String,
    pub title: String,
    pub snippet: String,
    pub score: f64,
}

/// A read-only handle to one `.khb` docset.
pub struct Docset {
    conn: Connection,
}

impl Docset {
    /// Open a docset file read-only.
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .with_context(|| format!("opening {}", path.display()))?;
        Ok(Self { conn })
    }

    /// Look up a `meta` value.
    pub fn meta(&self, key: &str) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row("SELECT value FROM meta WHERE key = ?1", params![key], |r| {
                r.get::<_, String>(0)
            })
            .optional()?)
    }

    /// The docset id (`meta.docset_id`).
    pub fn id(&self) -> Result<String> {
        self.meta("docset_id")?
            .context("docset is missing meta.docset_id")
    }

    /// The docset language (`meta.language`), defaulting to `en`.
    pub fn language(&self) -> Result<String> {
        Ok(self.meta("language")?.unwrap_or_else(|| "en".to_string()))
    }

    /// The full table of contents, ordered by parent then position.
    pub fn toc(&self) -> Result<Vec<TocEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, page_id, parent_id, position, title FROM toc \
             ORDER BY (parent_id IS NOT NULL), parent_id, position",
        )?;
        let rows = stmt
            .query_map([], |r| {
                Ok(TocEntry {
                    id: r.get(0)?,
                    page_id: r.get(1)?,
                    parent_id: r.get(2)?,
                    position: r.get(3)?,
                    title: r.get(4)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// All categories, ordered by position.
    pub fn categories(&self) -> Result<Vec<Category>> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, title FROM categories ORDER BY position")?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Category {
                    id: r.get(0)?,
                    title: r.get(1)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// The keyword index: each term with the pages it points at, sorted by term.
    pub fn keywords(&self) -> Result<Vec<KeywordEntry>> {
        let mut stmt = self
            .conn
            .prepare("SELECT term, page_id FROM keywords ORDER BY term, page_id")?;
        let mut entries: Vec<KeywordEntry> = Vec::new();
        let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
        for row in rows {
            let (term, page_id) = row?;
            match entries.last_mut() {
                Some(last) if last.term == term => last.page_ids.push(page_id),
                _ => entries.push(KeywordEntry {
                    term,
                    page_ids: vec![page_id],
                }),
            }
        }
        Ok(entries)
    }

    /// Fetch a page by id.
    pub fn page(&self, id: &str) -> Result<Option<Page>> {
        Ok(self
            .conn
            .query_row(
                "SELECT id, title, body_html FROM pages WHERE id = ?1",
                params![id],
                |r| {
                    Ok(Page {
                        id: r.get(0)?,
                        title: r.get(1)?,
                        body_html: r.get(2)?,
                    })
                },
            )
            .optional()?)
    }

    /// Full-text search over titles, body and keywords, ranked by bm25 with a
    /// highlighted snippet of the body.
    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchHit>> {
        let match_expr = fts_match_expr(query);
        if match_expr.is_empty() {
            return Ok(Vec::new());
        }
        let mut stmt = self.conn.prepare(
            "SELECT p.id, p.title, \
                    snippet(pages_fts, 1, '<mark>', '</mark>', '…', 12) AS snip, \
                    -bm25(pages_fts) AS score \
             FROM pages_fts JOIN pages p ON p.rowid = pages_fts.rowid \
             WHERE pages_fts MATCH ?1 \
             ORDER BY score DESC \
             LIMIT ?2",
        )?;
        let rows = stmt
            .query_map(params![match_expr, limit as i64], |r| {
                Ok(SearchHit {
                    page_id: r.get(0)?,
                    title: r.get(1)?,
                    snippet: r.get(2)?,
                    score: r.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// The ids of pages tagged with a category.
    pub fn pages_by_category(&self, category_id: &str) -> Result<Vec<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT page_id FROM page_categories WHERE category_id = ?1 ORDER BY page_id",
        )?;
        let rows = stmt
            .query_map(params![category_id], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// The table of contents as a nested tree (rebuilt from the flat rows).
    pub fn toc_tree(&self) -> Result<Vec<TocNode>> {
        Ok(build_toc_tree(&self.toc()?, None))
    }

    /// Read the whole docset back into a [`RenderedDocset`] — the inverse of the
    /// writer, used to down-convert a `.khb` to `.khbb`.
    pub fn to_rendered(&self) -> Result<RenderedDocset> {
        use std::collections::HashMap;

        let mut keywords_by_page: HashMap<String, Vec<String>> = HashMap::new();
        {
            let mut stmt = self
                .conn
                .prepare("SELECT page_id, term FROM keywords ORDER BY page_id, term")?;
            let rows =
                stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
            for row in rows {
                let (page_id, term) = row?;
                keywords_by_page.entry(page_id).or_default().push(term);
            }
        }

        let mut categories_by_page: HashMap<String, Vec<String>> = HashMap::new();
        {
            let mut stmt = self.conn.prepare(
                "SELECT page_id, category_id FROM page_categories ORDER BY page_id, category_id",
            )?;
            let rows =
                stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
            for row in rows {
                let (page_id, category_id) = row?;
                categories_by_page
                    .entry(page_id)
                    .or_default()
                    .push(category_id);
            }
        }

        let mut pages = Vec::new();
        {
            let mut stmt = self
                .conn
                .prepare("SELECT id, title, body_html, plain FROM pages ORDER BY rowid")?;
            let rows = stmt.query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                ))
            })?;
            for row in rows {
                let (id, title, body_html, plain) = row?;
                let keywords = keywords_by_page.remove(&id).unwrap_or_default();
                let categories = categories_by_page.remove(&id).unwrap_or_default();
                pages.push(RenderedPage {
                    id,
                    title,
                    body_html,
                    plain,
                    keywords,
                    categories,
                });
            }
        }

        Ok(RenderedDocset {
            id: self.id()?,
            title: self.meta("title")?.unwrap_or_default(),
            version: self.meta("version")?.unwrap_or_default(),
            language: self.language()?,
            pages,
            toc: self.toc_tree()?,
            categories: self.categories()?,
        })
    }
}

/// Rebuild the nested TOC tree from the flat `toc` rows.
fn build_toc_tree(flat: &[TocEntry], parent: Option<i64>) -> Vec<TocNode> {
    let mut level: Vec<&TocEntry> = flat.iter().filter(|e| e.parent_id == parent).collect();
    level.sort_by_key(|e| e.position);
    level
        .into_iter()
        .map(|e| TocNode {
            page_id: e.page_id.clone(),
            title: e.title.clone(),
            children: build_toc_tree(flat, Some(e.id)),
        })
        .collect()
}

/// Turn a user query into a safe FTS5 MATCH expression: each whitespace-separated
/// term becomes a quoted literal (so punctuation can't break the query syntax),
/// combined with implicit AND.
fn fts_match_expr(query: &str) -> String {
    query
        .split_whitespace()
        .map(|term| format!("\"{}\"", term.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ")
}
