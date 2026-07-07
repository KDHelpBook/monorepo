//! khb-core — the shared data engine.
//!
//! This crate owns everything about the `.khb` docset format: the SQLite schema,
//! the source model, Markdown rendering, the writer, and the `Docset`/`Collection`
//! query API. It is compiled both natively (for the CLI and, later, Tauri) and to
//! wasm (for the browser viewer). It must stay free of any DOM or JS assumptions.

pub mod assets;
pub mod binary;
pub mod build;
pub mod docset;
pub mod llms;
pub mod markdown;
pub mod model;
pub mod render;
pub mod schema;
pub mod source;
pub mod vfs;

pub use docset::{Attachments, Docset, KeywordEntry, Page, SearchHit, TocEntry};
pub use model::{Asset, Category, RenderedDocset, RenderedPage, SourceDocset, SourcePage, TocNode};
pub use vfs::{FileRangeReader, RangeReader};

/// The on-disk `.khb`/`.khbb` format version this build reads and writes. Bump it
/// whenever the schema or the rendered-docset layout that `.khbb` encodes changes
/// incompatibly. (Pre-release development iterated within version 1.)
pub const FORMAT_VERSION: u32 = 1;

/// The crate version, surfaced in a docset's `meta.generator`.
pub fn generator() -> String {
    format!("khb-core {}", env!("CARGO_PKG_VERSION"))
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
            collection: "demo-family".into(),
            collection_title: "Demo Family".into(),
            products: Vec::new(),
            pages: vec![
                SourcePage {
                    id: "intro".into(),
                    title: "Introduction".into(),
                    markdown:
                        "# Introduction\n\n![logo](assets/logo.svg)\n\nThe quick brown foxes jump over lazy dogs."
                            .into(),
                    keywords: vec!["intro".into(), "start".into()],
                    categories: vec!["basics".into()],
                    related: vec!["adv".into(), "other-book:page".into()],
                    toc: None,
                },
                SourcePage {
                    id: "adv".into(),
                    title: "Advanced".into(),
                    markdown: "# Advanced\n\nAdvanced notes about foxes and searching.".into(),
                    keywords: vec!["advanced".into()],
                    categories: vec![],
                    related: vec![],
                    toc: None,
                },
            ],
            toc: vec![TocNode {
                page_id: Some("intro".into()),
                title: "Introduction".into(),
                children: vec![
                    // A pure folder node: title-only, groups its children.
                    TocNode {
                        page_id: None,
                        title: "More".into(),
                        children: vec![TocNode {
                            page_id: Some("adv".into()),
                            title: "Advanced".into(),
                            children: vec![],
                        }],
                    },
                ],
            }],
            categories: vec![Category {
                id: "basics".into(),
                title: "Basics".into(),
            }],
            assets: vec![Asset {
                path: "assets/logo.svg".into(),
                mime: "image/svg+xml".into(),
                data: b"<svg xmlns='http://www.w3.org/2000/svg'/>".to_vec(),
            }],
        }
    }

    #[test]
    fn build_and_query_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("demo.khb");
        let doc = render::render(&demo_source()).unwrap();
        build::build_khb(&doc, &path).unwrap();

        let ds = Docset::open(&path).unwrap();
        assert_eq!(ds.id().unwrap(), "demo");
        assert_eq!(ds.language().unwrap(), "en");
        assert_eq!(ds.collection().unwrap(), "demo-family");
        assert_eq!(ds.collection_title().unwrap(), "Demo Family");
        // No explicit products → defaults to one named after the collection.
        let products = ds.products().unwrap();
        assert_eq!(products.len(), 1);
        assert_eq!(products[0].id, "demo-family");
        assert_eq!(products[0].title, "Demo Family");
        assert_eq!(
            ds.meta("tokenizer").unwrap().unwrap(),
            "porter unicode61 remove_diacritics 2"
        );

        // TOC: a page root, a page-less folder under it, and a page inside the folder.
        let toc = ds.toc().unwrap();
        assert_eq!(toc.len(), 3);
        let root = toc.iter().find(|t| t.parent_id.is_none()).unwrap();
        assert_eq!(root.page_id.as_deref(), Some("intro"));
        let folder = toc.iter().find(|t| t.parent_id == Some(root.id)).unwrap();
        assert_eq!(folder.page_id, None);
        assert_eq!(folder.title, "More");
        assert!(toc
            .iter()
            .any(|t| t.parent_id == Some(folder.id) && t.page_id.as_deref() == Some("adv")));

        // Page render.
        let page = ds.page("intro").unwrap().unwrap();
        assert!(page.body_html.contains("<h1>"));
        assert!(ds.page("missing").unwrap().is_none());

        // Clean Markdown (`md` column): the source body, verbatim, for llms.txt / MCP.
        assert_eq!(
            ds.page_markdown("intro").unwrap().as_deref(),
            Some("# Introduction\n\n![logo](assets/logo.svg)\n\nThe quick brown foxes jump over lazy dogs.")
        );
        assert!(ds.page_markdown("missing").unwrap().is_none());

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

        // "See also" related links — within-book and a cross-book (`docsetId:id`)
        // reference stored verbatim (no foreign key), in author order.
        assert_eq!(
            ds.related("intro").unwrap(),
            vec!["adv".to_string(), "other-book:page".to_string()]
        );
        assert!(ds.related("adv").unwrap().is_empty());

        // Embedded asset + its rewritten link + routing index.
        assert_eq!(
            ds.asset_paths().unwrap(),
            vec!["assets/logo.svg".to_string()]
        );
        assert_eq!(
            ds.asset_pack("assets/logo.svg").unwrap().as_deref(),
            Some("")
        );
        assert!(ds.asset_pack("assets/missing.png").unwrap().is_none());
        let (mime, data) = docset::resolve_asset(&ds, &[], "assets/logo.svg")
            .unwrap()
            .unwrap();
        assert_eq!(mime, "image/svg+xml");
        assert!(data.starts_with(b"<svg"));
        assert!(page.body_html.contains("asset:assets/logo.svg"));
        assert!(docset::resolve_asset(&ds, &[], "assets/missing.png")
            .unwrap()
            .is_none());
    }

    #[test]
    fn llms_export_indexes_pages_and_carries_markdown() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("demo.khb");
        build::build_khb(&render::render(&demo_source()).unwrap(), &path).unwrap();
        let ds = Docset::open(&path).unwrap();

        let export = llms::export(&[&ds], None).unwrap();

        // Index: an H1 for the (single-book) title, plus a link per page in TOC order
        // (intro before its nested child adv), with a derived description.
        assert!(export.index.starts_with("# Demo\n"));
        let intro_at = export.index.find("md/demo/intro.md").expect("intro link");
        let adv_at = export.index.find("md/demo/adv.md").expect("adv link");
        assert!(intro_at < adv_at, "TOC order: intro precedes nested adv");
        assert!(export.index.contains("[Introduction](md/demo/intro.md)"));
        assert!(export
            .index
            .contains("The quick brown foxes jump over lazy dogs"));
        // The `#`-heading line is skipped when deriving the description.
        assert!(!export.index.contains("[Introduction](md/demo/intro.md): #"));

        // Full: every page's Markdown inline, with provenance comments.
        assert!(export.full.contains("<!-- demo/intro —"));
        assert!(export
            .full
            .contains("The quick brown foxes jump over lazy dogs."));

        // Per-page files: one each, clean Markdown, at the linked paths.
        let intro = export
            .pages
            .iter()
            .find(|p| p.path == "md/demo/intro.md")
            .expect("intro page file");
        assert!(intro.content.starts_with("# Introduction"));
        assert_eq!(export.pages.len(), 2);
    }

    #[test]
    fn khba_sidecar_holds_assets_kept_out_of_the_khb() {
        let dir = tempfile::tempdir().unwrap();
        let doc = render::render(&demo_source()).unwrap();

        // Sidecar mode: a lean .khb (assets removed) + a .khba carrying them, with
        // the .khb's routing index pointing at that pack (as the CLI does).
        let khb = dir.path().join("demo.khb");
        let khba = dir.path().join("demo.khba");
        let mut lean = doc.clone();
        let taken = std::mem::take(&mut lean.assets);
        build::build_khb(&lean, &khb).unwrap();
        build::build_khba(&doc.id, &taken, &khba).unwrap();
        let pack = build::khba_pack_id(&khba);
        build::rebuild_asset_index(&khb, &[(pack.clone(), vec!["assets/logo.svg".into()])])
            .unwrap();

        let ds = Docset::open(&khb).unwrap();
        assert!(ds.asset_paths().unwrap().is_empty()); // not embedded
        assert_eq!(
            ds.asset_pack("assets/logo.svg").unwrap(),
            Some(pack.clone())
        );
        assert!(ds
            .page("intro")
            .unwrap()
            .unwrap()
            .body_html
            .contains("asset:"));

        let att = Attachments::open(&khba).unwrap();
        assert_eq!(att.docset_id().unwrap().as_deref(), Some("demo"));
        assert_eq!(att.pack_id().unwrap(), Some(pack));
        // Resolution routes through the index straight to the sidecar.
        let (mime, data) = docset::resolve_asset(&ds, &[att], "assets/logo.svg")
            .unwrap()
            .unwrap();
        assert_eq!(mime, "image/svg+xml");
        assert!(!data.is_empty());
    }

    #[test]
    fn khbb_roundtrip_matches_khb() {
        let doc = render::render(&demo_source()).unwrap();

        // RenderedDocset -> .khbb bytes -> RenderedDocset
        let bytes = binary::to_khbb(&doc).unwrap();
        let restored = binary::from_khbb(&bytes).unwrap();
        assert_eq!(restored.id, doc.id);
        assert_eq!(restored.pages.len(), doc.pages.len());
        // The v6 page-less folder node survives the binary round-trip.
        assert_eq!(restored.toc[0].children[0].page_id, None);

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
    fn several_khba_back_one_khb_routed_by_index() {
        let dir = tempfile::tempdir().unwrap();
        let doc = render::render(&demo_source()).unwrap();

        // A lean .khb with no embedded assets, plus two attachment packs.
        let khb = dir.path().join("demo.khb");
        let mut lean = doc.clone();
        lean.assets.clear();
        build::build_khb(&lean, &khb).unwrap();

        let images = dir.path().join("demo.images.khba");
        let samples = dir.path().join("demo.samples.khba");
        build::build_khba(
            &doc.id,
            &[Asset {
                path: "assets/logo.svg".into(),
                mime: "image/svg+xml".into(),
                data: b"<svg/>".to_vec(),
            }],
            &images,
        )
        .unwrap();
        build::build_khba(
            &doc.id,
            &[Asset {
                path: "assets/sample.txt".into(),
                mime: "text/plain".into(),
                data: b"hello".to_vec(),
            }],
            &samples,
        )
        .unwrap();
        build::rebuild_asset_index(
            &khb,
            &[
                (build::khba_pack_id(&images), vec!["assets/logo.svg".into()]),
                (
                    build::khba_pack_id(&samples),
                    vec!["assets/sample.txt".into()],
                ),
            ],
        )
        .unwrap();

        let ds = Docset::open(&khb).unwrap();
        // Pass packs in REVERSED order: routing is by pack id, not position.
        let packs = vec![
            Attachments::open(&samples).unwrap(),
            Attachments::open(&images).unwrap(),
        ];
        let (m1, _) = docset::resolve_asset(&ds, &packs, "assets/logo.svg")
            .unwrap()
            .unwrap();
        assert_eq!(m1, "image/svg+xml");
        let (m2, d2) = docset::resolve_asset(&ds, &packs, "assets/sample.txt")
            .unwrap()
            .unwrap();
        assert_eq!(m2, "text/plain");
        assert_eq!(d2, b"hello");
        assert!(docset::resolve_asset(&ds, &packs, "assets/nope.png")
            .unwrap()
            .is_none());
    }

    #[test]
    fn generator_reports_crate_version() {
        assert!(generator().starts_with("khb-core "));
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
