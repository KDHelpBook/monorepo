//! KD Help Book — desktop (Tauri) backend.
//!
//! The desktop app is the same viewer UI as the web build, but its data layer talks to
//! the **native Rust `khb-core`** (bundled SQLite, real bm25 FTS5) instead of the
//! browser's wa-sqlite. These commands are the IPC surface a `TauriDocset`
//! (`viewer-ts/src/data/tauri-docset.ts`) calls to satisfy the shared `IDocset`
//! contract. Rust owns the open docsets — the one native source of truth the future
//! embedded MCP server will share.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use anyhow::Result;
use base64::Engine;
use khb_core::docset::{resolve_asset, Attachments, Docset};
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};

/// One open book: its docset plus any sidecar `.khba` attachment packs.
struct Book {
    docset: Docset,
    attachments: Vec<Attachments>,
}

/// The open docsets, keyed by docset id. `rusqlite::Connection` is `Send` but not
/// `Sync`, so every access goes through this `Mutex` (which makes the map `Sync`).
#[derive(Default)]
struct AppState {
    docsets: Mutex<HashMap<String, Book>>,
}

// --- IPC DTOs. Field names are chosen to match viewer-ts/src/data/docset.ts exactly:
// most are camelCase; the TOC rows stay snake_case because the TS `buildTocTree` reads
// `page_id`/`parent_id` straight off them (same shape the SQL rows have). ---

/// A flat `toc` row — fed as-is to the TS `buildTocTree` (hence snake_case keys).
#[derive(Serialize)]
struct TocRow {
    id: i64,
    page_id: Option<String>,
    parent_id: Option<i64>,
    position: i64,
    title: String,
}

#[derive(Serialize)]
struct IdTitle {
    id: String,
    title: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct KeywordDto {
    term: String,
    page_ids: Vec<String>,
}

#[derive(Serialize)]
struct MissingDto {
    path: String,
    pack: String,
}

/// Everything a `TauriDocset` needs to cache its structure at open (mirrors the eager
/// load `StreamingDocset` does from SQL).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DocsetInit {
    id: String,
    language: String,
    title: String,
    collection: String,
    collection_title: String,
    version: String,
    products: Vec<IdTitle>,
    toc: Vec<TocRow>,
    categories: Vec<IdTitle>,
    keywords: Vec<KeywordDto>,
    /// `(page_id, related_id)` "See also" edges.
    related: Vec<(String, String)>,
    /// `(category_id, page_id)` facet memberships.
    page_categories: Vec<(String, String)>,
    /// Assets whose owning `.khba` pack isn't loaded.
    missing: Vec<MissingDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PageDto {
    id: String,
    title: String,
    body_html: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HitDto {
    page_id: String,
    title: String,
    snippet: String,
    score: f64,
}

/// An asset's bytes, base64-encoded (a compact JSON payload; the TS side decodes it to
/// a `Uint8Array`). Raw `Vec<u8>` would serialize to a huge number array.
#[derive(Serialize)]
struct AssetDto {
    mime: String,
    base64: String,
}

/// A docset to open: the `.khb` path plus any sidecar `.khba` paths.
#[derive(Deserialize)]
struct OpenSpec {
    path: String,
    #[serde(default)]
    sidecars: Vec<String>,
}

fn open_one(spec: &OpenSpec) -> Result<Book> {
    let docset = Docset::open(Path::new(&spec.path))?;
    let attachments = spec
        .sidecars
        .iter()
        .filter_map(|s| Attachments::open(Path::new(s)).ok())
        .collect();
    Ok(Book {
        docset,
        attachments,
    })
}

/// Read the meta + all small structural tables into a [`DocsetInit`].
fn build_init(book: &Book) -> Result<DocsetInit> {
    let ds = &book.docset;
    let id = ds.id()?;
    let collection = ds.collection()?;
    let collection_title = ds.collection_title()?;
    let title = ds.meta("title")?.unwrap_or_else(|| id.clone());
    let version = ds.meta("version")?.unwrap_or_default();

    let toc = ds
        .toc()?
        .into_iter()
        .map(|t| TocRow {
            id: t.id,
            page_id: t.page_id,
            parent_id: t.parent_id,
            position: t.position,
            title: t.title,
        })
        .collect();
    let categories = ds
        .categories()?
        .into_iter()
        .map(|c| IdTitle {
            id: c.id,
            title: c.title,
        })
        .collect();
    let products = ds
        .products()?
        .into_iter()
        .map(|p| IdTitle {
            id: p.id,
            title: p.title,
        })
        .collect();
    let keywords = ds
        .keywords()?
        .into_iter()
        .map(|k| KeywordDto {
            term: k.term,
            page_ids: k.page_ids,
        })
        .collect();

    // Assets routed to a sidecar pack that isn't loaded → "missing" (locate in Manage).
    let loaded: Vec<String> = book
        .attachments
        .iter()
        .filter_map(|a| a.pack_id().ok().flatten())
        .collect();
    let missing = ds
        .external_assets()?
        .into_iter()
        .filter(|(_, pack)| !loaded.iter().any(|p| p == pack))
        .map(|(path, pack)| MissingDto { path, pack })
        .collect();

    Ok(DocsetInit {
        id,
        language: ds.language()?,
        title,
        collection,
        collection_title,
        version,
        products,
        toc,
        categories,
        keywords,
        related: ds.related_all()?,
        page_categories: ds.page_categories_all()?,
        missing,
    })
}

/// Open each `.khb` (+ its sidecars), stash it in state, and return its structure.
#[tauri::command]
fn open_docsets(specs: Vec<OpenSpec>, state: State<AppState>) -> Result<Vec<DocsetInit>, String> {
    let mut inits = Vec::new();
    for spec in &specs {
        let book = open_one(spec).map_err(|e| e.to_string())?;
        let init = build_init(&book).map_err(|e| e.to_string())?;
        state.docsets.lock().unwrap().insert(init.id.clone(), book);
        inits.push(init);
    }
    Ok(inits)
}

/// Open every `.khb` bundled in the app's `resources/docsets/` (offering all bundled
/// `.khba` to each — `asset_index` routing keys by pack id, so only referenced packs
/// are used). Called once at startup.
#[tauri::command]
fn bundled_docsets(
    app: tauri::AppHandle,
    state: State<AppState>,
) -> Result<Vec<DocsetInit>, String> {
    let dir = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?
        .join("docsets");
    let mut khb = Vec::new();
    let mut khba = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.flatten() {
            let p = e.path();
            match p.extension().and_then(|x| x.to_str()) {
                Some("khb") => khb.push(p.to_string_lossy().into_owned()),
                Some("khba") => khba.push(p.to_string_lossy().into_owned()),
                _ => {}
            }
        }
    }
    khb.sort();
    let specs = khb
        .into_iter()
        .map(|path| OpenSpec {
            path,
            sidecars: khba.clone(),
        })
        .collect();
    open_docsets(specs, state)
}

#[tauri::command]
fn page(
    docset_id: String,
    page_id: String,
    state: State<AppState>,
) -> Result<Option<PageDto>, String> {
    let map = state.docsets.lock().unwrap();
    let Some(book) = map.get(&docset_id) else {
        return Ok(None);
    };
    let p = book.docset.page(&page_id).map_err(|e| e.to_string())?;
    Ok(p.map(|p| PageDto {
        id: p.id,
        title: p.title,
        body_html: p.body_html,
    }))
}

#[tauri::command]
fn asset(
    docset_id: String,
    path: String,
    state: State<AppState>,
) -> Result<Option<AssetDto>, String> {
    let map = state.docsets.lock().unwrap();
    let Some(book) = map.get(&docset_id) else {
        return Ok(None);
    };
    let found = resolve_asset(&book.docset, &book.attachments, &path).map_err(|e| e.to_string())?;
    Ok(found.map(|(mime, data)| AssetDto {
        mime,
        base64: base64::engine::general_purpose::STANDARD.encode(data),
    }))
}

#[tauri::command]
fn search(
    docset_id: String,
    query: String,
    limit: usize,
    state: State<AppState>,
) -> Result<Vec<HitDto>, String> {
    let map = state.docsets.lock().unwrap();
    let Some(book) = map.get(&docset_id) else {
        return Ok(Vec::new());
    };
    let hits = book
        .docset
        .search(&query, limit)
        .map_err(|e| e.to_string())?;
    Ok(hits
        .into_iter()
        .map(|h| HitDto {
            page_id: h.page_id,
            title: h.title,
            snippet: h.snippet,
            score: h.score,
        })
        .collect())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            open_docsets,
            bundled_docsets,
            page,
            asset,
            search
        ])
        .run(tauri::generate_context!())
        .expect("error while running KD Help Book");
}
