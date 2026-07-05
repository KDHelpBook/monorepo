//! kdhelp-core — the shared data engine.
//!
//! This crate owns everything about the `.khb` docset format: the SQLite schema,
//! the source model, Markdown rendering, the writer, and the `Docset`/`Collection`
//! query API. It is compiled both natively (for the CLI and, later, Tauri) and to
//! wasm (for the browser viewer). It must stay free of any DOM or JS assumptions.

pub mod binary;
pub mod build;
pub mod docset;
pub mod markdown;
pub mod model;
pub mod render;
pub mod schema;
pub mod source;

pub use docset::{Docset, KeywordEntry, Page, SearchHit, TocEntry};
pub use model::{Category, RenderedDocset, RenderedPage, SourceDocset, SourcePage, TocNode};

/// The on-disk `.khb` format version this build reads and writes.
pub const FORMAT_VERSION: u32 = 1;

/// The crate version, surfaced in a docset's `meta.generator`.
pub fn generator() -> String {
    format!("kdhelp-core {}", env!("CARGO_PKG_VERSION"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn demo_source() -> SourceDocset {
        SourceDocset {
            id: "demo".into(),
            title: "Demo".into(),
            version: "1.0".into(),
            language: "en".into(),
            pages: vec![
                SourcePage {
                    id: "intro".into(),
                    title: "Introduction".into(),
                    markdown: "# Introduction\n\nThe quick brown foxes jump over lazy dogs.".into(),
                    keywords: vec!["intro".into(), "start".into()],
                    categories: vec!["basics".into()],
                },
                SourcePage {
                    id: "adv".into(),
                    title: "Advanced".into(),
                    markdown: "# Advanced\n\nAdvanced notes about foxes and searching.".into(),
                    keywords: vec!["advanced".into()],
                    categories: vec![],
                },
            ],
            toc: vec![TocNode {
                page_id: "intro".into(),
                title: "Introduction".into(),
                children: vec![TocNode {
                    page_id: "adv".into(),
                    title: "Advanced".into(),
                    children: vec![],
                }],
            }],
            categories: vec![Category {
                id: "basics".into(),
                title: "Basics".into(),
            }],
        }
    }

    #[test]
    fn build_and_query_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("demo.khb");
        let doc = render::render(&demo_source());
        build::build_khb(&doc, &path).unwrap();

        let ds = Docset::open(&path).unwrap();
        assert_eq!(ds.id().unwrap(), "demo");
        assert_eq!(ds.language().unwrap(), "en");
        assert_eq!(
            ds.meta("tokenizer").unwrap().unwrap(),
            "porter unicode61 remove_diacritics 2"
        );

        // TOC: two entries, one nested under the other.
        let toc = ds.toc().unwrap();
        assert_eq!(toc.len(), 2);
        let root = toc.iter().find(|t| t.parent_id.is_none()).unwrap();
        assert_eq!(root.page_id, "intro");
        assert!(toc
            .iter()
            .any(|t| t.parent_id == Some(root.id) && t.page_id == "adv"));

        // Page render.
        let page = ds.page("intro").unwrap().unwrap();
        assert!(page.body_html.contains("<h1>"));
        assert!(ds.page("missing").unwrap().is_none());

        // Full-text search: the Porter stemmer makes "fox" match "foxes" on both pages.
        let hits = ds.search("fox", 10).unwrap();
        assert_eq!(hits.len(), 2);
        assert!(hits[0].snippet.contains("<mark>"));

        // Categories facet.
        let cats = ds.categories().unwrap();
        assert_eq!(cats.len(), 1);
        assert_eq!(
            ds.pages_by_category("basics").unwrap(),
            vec!["intro".to_string()]
        );

        // Keyword index.
        let kw = ds.keywords().unwrap();
        assert!(kw
            .iter()
            .any(|k| k.term == "intro" && k.page_ids == vec!["intro".to_string()]));
    }

    #[test]
    fn khbb_roundtrip_matches_khb() {
        let doc = render::render(&demo_source());

        // RenderedDocset -> .khbb bytes -> RenderedDocset
        let bytes = binary::to_khbb(&doc).unwrap();
        let restored = binary::from_khbb(&bytes).unwrap();
        assert_eq!(restored.id, doc.id);
        assert_eq!(restored.pages.len(), doc.pages.len());

        // Rebuild a .khb from the restored data; search still works.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("from_khbb.khb");
        build::build_khb(&restored, &path).unwrap();
        let ds = Docset::open(&path).unwrap();
        assert_eq!(ds.search("fox", 10).unwrap().len(), 2);

        // And the reverse: .khb -> RenderedDocset reproduces the same shape.
        let back = ds.to_rendered().unwrap();
        assert_eq!(back.pages.len(), doc.pages.len());
        assert_eq!(back.toc.len(), doc.toc.len());
        assert_eq!(back.categories.len(), doc.categories.len());
    }

    #[test]
    fn generator_reports_crate_version() {
        assert!(generator().starts_with("kdhelp-core "));
    }

    #[test]
    fn bundled_sqlite_has_fts5() {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE VIRTUAL TABLE t USING fts5(body, tokenize='porter unicode61');
             INSERT INTO t(body) VALUES('the quick brown foxes');",
        )
        .unwrap();
        let n: i64 = conn
            .query_row("SELECT count(*) FROM t WHERE t MATCH 'fox'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(n, 1);
    }
}
