//! End-to-end test of the extension subprocess path: a real child process is spawned,
//! fed the JSON request, and its Markdown + generated asset are spliced into the page.
//!
//! Gated on the `ext-stub` feature (which builds the `khb-ext-stub` helper this test
//! drives); run with `cargo test -p khb-cli --features ext-stub`. A plain `cargo test`
//! compiles this file to nothing — the rest of the extension logic is covered by the
//! unit tests in `khb-core`.
#![cfg(feature = "ext-stub")]

use khb_core::model::{Extension, SourceDocset, SourcePage};
use khb_core::render::{render, RenderOptions};

fn demo(extensions: Vec<Extension>) -> SourceDocset {
    SourceDocset {
        id: "t".into(),
        title: "T".into(),
        version: "1".into(),
        language: "en".into(),
        collection: "t".into(),
        collection_title: "T".into(),
        products: vec![],
        pages: vec![SourcePage {
            id: "intro".into(),
            title: "Intro".into(),
            markdown: "# Intro\n\n```ext:label\nname: Fragile\n```\n".into(),
            keywords: vec![],
            categories: vec![],
            related: vec![],
            toc: None,
            source_path: None,
        }],
        toc: vec![],
        categories: vec![],
        assets: vec![],
        extensions,
    }
}

fn label_ext() -> Vec<Extension> {
    vec![Extension {
        name: "label".into(),
        command: env!("CARGO_BIN_EXE_khb-ext-stub").into(),
        args: vec![],
    }]
}

#[test]
fn runs_extension_and_injects_asset() {
    let out = render(
        &demo(label_ext()),
        &RenderOptions {
            allow_extensions: true,
            source_dir: None,
        },
    )
    .unwrap();
    let page = &out.pages[0];
    // The tool's returned Markdown was rendered and spliced in …
    assert!(page.body_html.contains("Compiled label"));
    // … the `ext:` block itself is gone …
    assert!(!page.body_html.contains("language-ext:label"));
    // … the generated image is referenced through the `asset:` scheme …
    assert!(page
        .body_html
        .contains("asset:assets/ext/label/intro/0/out.svg"));
    // … and the file was injected into the docset's assets.
    assert!(out
        .assets
        .iter()
        .any(|a| a.path == "assets/ext/label/intro/0/out.svg"));
    // The AI-facing `md` column holds the *expanded* Markdown, not the raw block.
    let md = page.md.as_deref().unwrap();
    assert!(md.contains("Compiled label"));
    assert!(!md.contains("```ext:label"));
}

#[test]
fn without_flag_block_stays_code_and_no_asset() {
    // No `--allow-extensions`: the process is never spawned.
    let out = render(&demo(label_ext()), &RenderOptions::default()).unwrap();
    let page = &out.pages[0];
    assert!(page.body_html.contains("language-ext:label"));
    assert!(out.assets.is_empty());
    // `md` keeps the raw source (nothing was expanded).
    assert!(page.md.as_deref().unwrap().contains("```ext:label"));
}

#[test]
fn resolves_file_relative_to_page() {
    use std::fs;
    // A real source tree: the page lives in `pages/`, next to a data file it references.
    let dir = tempfile::tempdir().unwrap();
    let pages = dir.path().join("pages");
    fs::create_dir(&pages).unwrap();
    fs::write(pages.join("data.txt"), "SECRET_CODE_SAMPLE\n").unwrap();

    let mut src = demo(label_ext());
    // The block points the tool at a sibling file by a page-relative path (in `meta`).
    src.pages[0].markdown = "# Intro\n\n```ext:label ./data.txt\nname: Fragile\n```\n".into();
    src.pages[0].source_path = Some("pages/intro.md".into());

    let out = render(
        &src,
        &RenderOptions {
            allow_extensions: true,
            source_dir: Some(dir.path()),
        },
    )
    .unwrap();
    let page = &out.pages[0];
    // The tool read `./data.txt` relative to the page's directory (its cwd) and inlined it —
    // both in the rendered body and in the expanded `md`.
    assert!(
        page.body_html.contains("SECRET_CODE_SAMPLE"),
        "body: {}",
        page.body_html
    );
    assert!(page.md.as_deref().unwrap().contains("SECRET_CODE_SAMPLE"));
}
