//! Writer: turn a [`SourceDocset`] into a `.khb` SQLite file.

use std::path::Path;

use anyhow::{Context, Result};
use rusqlite::{params, Connection, Transaction};

use crate::model::{SourceDocset, SourceTocNode};
use crate::{markdown, schema};

/// Build a `.khb` docset at `out_path` (overwriting any existing file). Renders each
/// page's Markdown to HTML + plain text, populates the structural tables, builds the
/// FTS5 index with the language-appropriate tokenizer, then compacts with `VACUUM`.
pub fn build_khb(src: &SourceDocset, out_path: &Path) -> Result<()> {
    if out_path.exists() {
        std::fs::remove_file(out_path)
            .with_context(|| format!("removing existing {}", out_path.display()))?;
    }

    let mut conn =
        Connection::open(out_path).with_context(|| format!("opening {}", out_path.display()))?;
    // page_size must be set before any table is created.
    conn.execute_batch("PRAGMA page_size = 4096;")?;

    let tokenizer = schema::tokenizer_for_language(&src.language);

    let tx = conn.transaction()?;
    tx.execute_batch(schema::SCHEMA_SQL)?;

    write_meta(&tx, src, tokenizer)?;
    // Categories before pages: `page_categories` rows reference `categories(id)`,
    // and the bundled SQLite enforces foreign keys. Pages before toc for the same
    // reason (`toc.page_id` → `pages(id)`).
    write_categories(&tx, src)?;
    write_pages(&tx, src)?;
    write_toc(&tx, &src.toc, None)?;

    tx.execute_batch(&schema::create_fts_sql(tokenizer))?;
    // Populate the external-content index from the `pages` table.
    tx.execute_batch("INSERT INTO pages_fts(pages_fts) VALUES('rebuild');")?;

    tx.commit()?;
    conn.execute_batch("VACUUM;")?;
    Ok(())
}

fn write_meta(tx: &Transaction, src: &SourceDocset, tokenizer: &str) -> Result<()> {
    let entries = [
        ("format_version", crate::FORMAT_VERSION.to_string()),
        ("docset_id", src.id.clone()),
        ("title", src.title.clone()),
        ("version", src.version.clone()),
        ("language", src.language.clone()),
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

fn write_pages(tx: &Transaction, src: &SourceDocset) -> Result<()> {
    for page in &src.pages {
        let html = markdown::render_html(&page.markdown);
        let plain = markdown::html_to_plain(&html);
        let keywords_text = page.keywords.join(" ");
        tx.execute(
            "INSERT INTO pages(id, title, body_html, plain, keywords) VALUES(?1, ?2, ?3, ?4, ?5)",
            params![page.id, page.title, html, plain, keywords_text],
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

fn write_categories(tx: &Transaction, src: &SourceDocset) -> Result<()> {
    for (position, category) in src.categories.iter().enumerate() {
        tx.execute(
            "INSERT INTO categories(id, title, position) VALUES(?1, ?2, ?3)",
            params![category.id, category.title, position as i64],
        )?;
    }
    Ok(())
}

fn write_toc(tx: &Transaction, nodes: &[SourceTocNode], parent: Option<i64>) -> Result<()> {
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
