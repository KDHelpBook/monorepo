//! Reader: open a `.khb` docset and query it.
//!
//! This is the query surface the viewer (via wasm) and Tauri (natively) both use.
//! It is read-only — writing/compiling is the job of [`crate::build`].

use std::path::Path;

use anyhow::{Context, Result};
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};

use crate::model::{Asset, Category, Product, RenderedDocset, RenderedPage, TocNode};

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

    /// Wrap an already-open connection (e.g. one opened through the Range-VFS).
    pub(crate) fn from_conn(conn: Connection) -> Self {
        Self { conn }
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

    /// The product/family id (`meta.collection`), defaulting to the docset id.
    pub fn collection(&self) -> Result<String> {
        match self.meta("collection")? {
            Some(c) => Ok(c),
            None => self.id(),
        }
    }

    /// The family display title (`meta.collection_title`), defaulting to the title.
    pub fn collection_title(&self) -> Result<String> {
        Ok(self
            .meta("collection_title")?
            .or(self.meta("title")?)
            .unwrap_or_default())
    }

    /// Products this book belongs to (many-to-many facet). Falls back to a single
    /// product named after the `collection` when the table is absent (older `.khb`)
    /// or empty, so the viewer's product scope keeps working for un-migrated docsets.
    pub fn products(&self) -> Result<Vec<Product>> {
        let mut stmt = match self
            .conn
            .prepare("SELECT id, title FROM products ORDER BY position")
        {
            Ok(stmt) => stmt,
            Err(_) => return self.default_products(),
        };
        let rows = stmt
            .query_map([], |r| {
                Ok(Product {
                    id: r.get(0)?,
                    title: r.get(1)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        if rows.is_empty() {
            self.default_products()
        } else {
            Ok(rows)
        }
    }

    fn default_products(&self) -> Result<Vec<Product>> {
        Ok(vec![Product {
            id: self.collection()?,
            title: self.collection_title()?,
        }])
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

    /// Fetch a page's clean Markdown body, if the docset carries one (the optional
    /// `md` column). `Ok(None)` if the page has no Markdown (a non-Markdown producer)
    /// or the id is unknown. This is the AI-facing read (llms.txt export, MCP
    /// `get_page`); it's a separate query from [`page`](Self::page) so the common
    /// HTML render path never streams the `md` bytes.
    pub fn page_markdown(&self, id: &str) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row("SELECT md FROM pages WHERE id = ?1", params![id], |r| {
                r.get::<_, Option<String>>(0)
            })
            .optional()?
            .flatten())
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

    /// Fetch an embedded asset's MIME type and bytes by path. Returns `None` if the
    /// docset has no such asset (including when attachments are shipped in a sidecar
    /// `.khba` instead — see [`Attachments`]).
    pub fn asset(&self, path: &str) -> Result<Option<(String, Vec<u8>)>> {
        query_asset(&self.conn, path)
    }

    /// The paths of all embedded assets.
    pub fn asset_paths(&self) -> Result<Vec<String>> {
        query_asset_paths(&self.conn)
    }

    /// Which store holds `path`, per this docset's routing index: `Some("")` means
    /// embedded in this `.khb`, `Some(id)` names the sidecar whose `meta.pack` is
    /// `id`, and `None` means the asset is unknown to this docset.
    pub fn asset_pack(&self, path: &str) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row(
                "SELECT pack FROM asset_index WHERE path = ?1",
                params![path],
                |r| r.get::<_, String>(0),
            )
            .optional()?)
    }

    /// The ids of a page's related ("See also") pages, in author order.
    pub fn related(&self, page_id: &str) -> Result<Vec<String>> {
        let mut stmt = self
            .conn
            .prepare("SELECT related_id FROM related WHERE page_id = ?1 ORDER BY position")?;
        let rows = stmt
            .query_map(params![page_id], |r| r.get::<_, String>(0))?
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

        let mut related_by_page: HashMap<String, Vec<String>> = HashMap::new();
        {
            let mut stmt = self
                .conn
                .prepare("SELECT page_id, related_id FROM related ORDER BY page_id, position")?;
            let rows =
                stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
            for row in rows {
                let (page_id, related_id) = row?;
                related_by_page.entry(page_id).or_default().push(related_id);
            }
        }

        let mut pages = Vec::new();
        {
            let mut stmt = self
                .conn
                .prepare("SELECT id, title, body_html, plain, md FROM pages ORDER BY rowid")?;
            let rows = stmt.query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, String>(3)?,
                    r.get::<_, Option<String>>(4)?,
                ))
            })?;
            for row in rows {
                let (id, title, body_html, plain, md) = row?;
                let keywords = keywords_by_page.remove(&id).unwrap_or_default();
                let categories = categories_by_page.remove(&id).unwrap_or_default();
                let related = related_by_page.remove(&id).unwrap_or_default();
                pages.push(RenderedPage {
                    id,
                    title,
                    body_html,
                    plain,
                    keywords,
                    categories,
                    related,
                    md,
                });
            }
        }

        Ok(RenderedDocset {
            id: self.id()?,
            title: self.meta("title")?.unwrap_or_default(),
            version: self.meta("version")?.unwrap_or_default(),
            language: self.language()?,
            collection: self.collection()?,
            collection_title: self.collection_title()?,
            products: self.products()?,
            pages,
            toc: self.toc_tree()?,
            categories: self.categories()?,
            assets: query_assets(&self.conn)?,
        })
    }
}

/// A read-only handle to a sidecar `.khba` attachments file. Same `assets` table as
/// an embedded docset, opened separately so a lean `.khb` can pair with its bytes.
pub struct Attachments {
    conn: Connection,
}

impl Attachments {
    /// Open a `.khba` file read-only.
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open_with_flags(
            path,
            OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )
        .with_context(|| format!("opening {}", path.display()))?;
        Ok(Self { conn })
    }

    /// The owning docset id (`meta.docset_id`), if recorded.
    pub fn docset_id(&self) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row("SELECT value FROM meta WHERE key = 'docset_id'", [], |r| {
                r.get::<_, String>(0)
            })
            .optional()?)
    }

    /// This pack's stable id (`meta.pack`), referenced by a `.khb`'s routing index.
    pub fn pack_id(&self) -> Result<Option<String>> {
        Ok(self
            .conn
            .query_row("SELECT value FROM meta WHERE key = 'pack'", [], |r| {
                r.get::<_, String>(0)
            })
            .optional()?)
    }

    /// Fetch an asset's MIME type and bytes by path.
    pub fn asset(&self, path: &str) -> Result<Option<(String, Vec<u8>)>> {
        query_asset(&self.conn, path)
    }

    /// The paths of all attachments.
    pub fn asset_paths(&self) -> Result<Vec<String>> {
        query_asset_paths(&self.conn)
    }
}

/// Resolve an asset for a docset that may be backed by **several** sidecar `.khba`
/// packs, using the docset's routing index: look up which store owns `path`, then
/// read only from that store — no probing every pack. `''` is the embedded store;
/// any other id names the sidecar whose `meta.pack` matches. Returns `None` if the
/// asset is unknown or its pack is not among `attachments`.
pub fn resolve_asset(
    docset: &Docset,
    attachments: &[Attachments],
    path: &str,
) -> Result<Option<(String, Vec<u8>)>> {
    let Some(pack) = docset.asset_pack(path)? else {
        return Ok(None);
    };
    if pack.is_empty() {
        return docset.asset(path);
    }
    for att in attachments {
        if att.pack_id()?.as_deref() == Some(pack.as_str()) {
            return att.asset(path);
        }
    }
    Ok(None)
}

/// True if `assets` exists in this database (a v1 `.khb` predates it).
fn has_assets_table(conn: &Connection) -> Result<bool> {
    Ok(conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='assets'",
            [],
            |_| Ok(()),
        )
        .optional()?
        .is_some())
}

fn query_asset(conn: &Connection, path: &str) -> Result<Option<(String, Vec<u8>)>> {
    if !has_assets_table(conn)? {
        return Ok(None);
    }
    Ok(conn
        .query_row(
            "SELECT mime, data FROM assets WHERE path = ?1",
            params![path],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, Vec<u8>>(1)?)),
        )
        .optional()?)
}

fn query_asset_paths(conn: &Connection) -> Result<Vec<String>> {
    if !has_assets_table(conn)? {
        return Ok(Vec::new());
    }
    let mut stmt = conn.prepare("SELECT path FROM assets ORDER BY path")?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn query_assets(conn: &Connection) -> Result<Vec<Asset>> {
    if !has_assets_table(conn)? {
        return Ok(Vec::new());
    }
    let mut stmt = conn.prepare("SELECT path, mime, data FROM assets ORDER BY path")?;
    let rows = stmt
        .query_map([], |r| {
            Ok(Asset {
                path: r.get(0)?,
                mime: r.get(1)?,
                data: r.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
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
