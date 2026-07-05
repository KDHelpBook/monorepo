//! Writer: turn a [`RenderedDocset`] into a `.khb` SQLite file.

use std::path::Path;

use anyhow::{Context, Result};
use rusqlite::{params, Connection, Transaction};

use crate::model::{RenderedDocset, TocNode};
use crate::schema;

/// Build a `.khb` docset at `out_path` (overwriting any existing file). Populates the
/// structural tables from the rendered pages, builds the FTS5 index with the
/// language-appropriate tokenizer, then compacts with `VACUUM`.
pub fn build_khb(doc: &RenderedDocset, out_path: &Path) -> Result<()> {
    if out_path.exists() {
        std::fs::remove_file(out_path)
            .with_context(|| format!("removing existing {}", out_path.display()))?;
    }

    let mut conn =
        Connection::open(out_path).with_context(|| format!("opening {}", out_path.display()))?;
    // page_size must be set before any table is created.
    conn.execute_batch("PRAGMA page_size = 4096;")?;

    let tokenizer = schema::tokenizer_for_language(&doc.language);

    let tx = conn.transaction()?;
    tx.execute_batch(schema::SCHEMA_SQL)?;

    write_meta(&tx, doc, tokenizer)?;
    // Categories before pages: `page_categories` rows reference `categories(id)`,
    // and the bundled SQLite enforces foreign keys. Pages before toc for the same
    // reason (`toc.page_id` → `pages(id)`).
    write_categories(&tx, doc)?;
    write_pages(&tx, doc)?;
    write_toc(&tx, &doc.toc, None)?;
    write_related(&tx, doc)?; // after all pages exist (FK on both columns)

    // The `assets` table is always present; it stays empty when attachments are
    // shipped in a sidecar `.khba` instead of embedded here.
    tx.execute_batch(schema::ASSETS_SQL)?;
    write_assets(&tx, &doc.assets)?;

    // The routing index maps each embedded asset to pack '' (this .khb). When a
    // docset also has sidecar packs, `rebuild_asset_index` overwrites this with the
    // full routing (see the CLI's compile --assets sidecar / pack).
    tx.execute_batch(schema::ASSET_INDEX_SQL)?;
    for asset in &doc.assets {
        tx.execute(
            "INSERT OR IGNORE INTO asset_index(path, pack) VALUES(?1, '')",
            params![asset.path],
        )?;
    }

    tx.execute_batch(&schema::create_fts_sql(tokenizer))?;
    // Populate the external-content index from the `pages` table.
    tx.execute_batch("INSERT INTO pages_fts(pages_fts) VALUES('rebuild');")?;

    tx.commit()?;
    conn.execute_batch("VACUUM;")?;
    Ok(())
}

/// Write a sidecar `.khba` attachments file: a small SQLite database holding just
/// `meta` (format version + owning docset id) and the shared `assets` table. Used
/// when a docset is compiled with attachments kept out of the `.khb`.
pub fn build_khba(docset_id: &str, assets: &[crate::model::Asset], out_path: &Path) -> Result<()> {
    if out_path.exists() {
        std::fs::remove_file(out_path)
            .with_context(|| format!("removing existing {}", out_path.display()))?;
    }
    let mut conn =
        Connection::open(out_path).with_context(|| format!("opening {}", out_path.display()))?;
    conn.execute_batch("PRAGMA page_size = 4096;")?;

    // Stable pack id (the .khb's asset_index routes to this), derived from the file
    // name so it is self-describing regardless of load order.
    let pack = out_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("attachments")
        .to_string();

    let tx = conn.transaction()?;
    tx.execute_batch(schema::ATTACHMENTS_SCHEMA_SQL)?;
    for (key, value) in [
        ("format_version", crate::FORMAT_VERSION.to_string()),
        ("kind", "attachments".to_string()),
        ("docset_id", docset_id.to_string()),
        ("pack", pack),
        ("generator", crate::generator()),
    ] {
        tx.execute(
            "INSERT INTO meta(key, value) VALUES(?1, ?2)",
            params![key, value],
        )?;
    }
    write_assets(&tx, assets)?;
    tx.commit()?;
    conn.execute_batch("VACUUM;")?;
    Ok(())
}

/// The pack id `build_khba` stamps into a sidecar for a given output path.
pub fn khba_pack_id(out_path: &Path) -> String {
    out_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("attachments")
        .to_string()
}

/// Overwrite a `.khb`'s `asset_index` with the full routing across all its stores.
/// `entries` is `(pack_id, paths)` — `""` for the embedded store, otherwise a
/// sidecar's `meta.pack`; earlier entries win on duplicate paths (pass the embedded
/// store first for embedded precedence). Used once the complete set of packs backing
/// a docset is known (compile with a sidecar, or `pack`/`patch`).
pub fn rebuild_asset_index(khb_path: &Path, entries: &[(String, Vec<String>)]) -> Result<()> {
    let mut conn =
        Connection::open(khb_path).with_context(|| format!("opening {}", khb_path.display()))?;
    let tx = conn.transaction()?;
    tx.execute_batch("DELETE FROM asset_index;")?;
    for (pack, paths) in entries {
        for path in paths {
            tx.execute(
                "INSERT OR IGNORE INTO asset_index(path, pack) VALUES(?1, ?2)",
                params![path, pack],
            )?;
        }
    }
    tx.commit()?;
    Ok(())
}

fn write_assets(tx: &Transaction, assets: &[crate::model::Asset]) -> Result<()> {
    for asset in assets {
        tx.execute(
            "INSERT OR REPLACE INTO assets(path, mime, data) VALUES(?1, ?2, ?3)",
            params![asset.path, asset.mime, asset.data],
        )
        .with_context(|| format!("inserting asset {}", asset.path))?;
    }
    Ok(())
}

fn write_meta(tx: &Transaction, doc: &RenderedDocset, tokenizer: &str) -> Result<()> {
    let entries = [
        ("format_version", crate::FORMAT_VERSION.to_string()),
        ("docset_id", doc.id.clone()),
        ("title", doc.title.clone()),
        ("version", doc.version.clone()),
        ("language", doc.language.clone()),
        ("collection", doc.collection.clone()),
        ("collection_title", doc.collection_title.clone()),
        ("tokenizer", tokenizer.to_string()),
        ("generator", crate::generator()),
    ];
    for (key, value) in entries {
        tx.execute(
            "INSERT INTO meta(key, value) VALUES(?1, ?2)",
            params![key, value],
        )?;
    }
    Ok(())
}

fn write_pages(tx: &Transaction, doc: &RenderedDocset) -> Result<()> {
    for page in &doc.pages {
        let keywords_text = page.keywords.join(" ");
        tx.execute(
            "INSERT INTO pages(id, title, body_html, plain, keywords) VALUES(?1, ?2, ?3, ?4, ?5)",
            params![
                page.id,
                page.title,
                page.body_html,
                page.plain,
                keywords_text
            ],
        )
        .with_context(|| format!("inserting page {}", page.id))?;

        for term in &page.keywords {
            let term = term.trim();
            if term.is_empty() {
                continue;
            }
            tx.execute(
                "INSERT OR IGNORE INTO keywords(term, page_id) VALUES(?1, ?2)",
                params![term, page.id],
            )?;
        }
        for category_id in &page.categories {
            tx.execute(
                "INSERT OR IGNORE INTO page_categories(page_id, category_id) VALUES(?1, ?2)",
                params![page.id, category_id],
            )?;
        }
    }
    Ok(())
}

fn write_related(tx: &Transaction, doc: &RenderedDocset) -> Result<()> {
    for page in &doc.pages {
        for (position, related_id) in page.related.iter().enumerate() {
            tx.execute(
                "INSERT OR IGNORE INTO related(page_id, related_id, position) VALUES(?1, ?2, ?3)",
                params![page.id, related_id, position as i64],
            )
            .with_context(|| format!("relating {} -> {}", page.id, related_id))?;
        }
    }
    Ok(())
}

fn write_categories(tx: &Transaction, doc: &RenderedDocset) -> Result<()> {
    for (position, category) in doc.categories.iter().enumerate() {
        tx.execute(
            "INSERT INTO categories(id, title, position) VALUES(?1, ?2, ?3)",
            params![category.id, category.title, position as i64],
        )?;
    }
    Ok(())
}

fn write_toc(tx: &Transaction, nodes: &[TocNode], parent: Option<i64>) -> Result<()> {
    for (position, node) in nodes.iter().enumerate() {
        tx.execute(
            "INSERT INTO toc(page_id, parent_id, position, title) VALUES(?1, ?2, ?3, ?4)",
            params![node.page_id, parent, position as i64, node.title],
        )?;
        let id = tx.last_insert_rowid();
        write_toc(tx, &node.children, Some(id))?;
    }
    Ok(())
}
