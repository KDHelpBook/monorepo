//! KD Help Book — desktop (Tauri) backend.
//!
//! The desktop app is the same viewer UI as the web build, but its data layer talks to
//! the **native Rust `khb-core`** (bundled SQLite, real bm25 FTS5) instead of the
//! browser's wa-sqlite. These commands are the IPC surface a `TauriDocset`
//! (`viewer-ts/src/data/tauri-docset.ts`) calls to satisfy the shared `IDocset`
//! contract. Rust owns the open docsets — the one native source of truth the future
//! embedded MCP server will share.

mod http;

use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};

use anyhow::Result;
use base64::Engine;
use http::HttpRangeReader;
use khb_core::docset::{resolve_asset, Attachments, Docset};
use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuBuilder, MenuItem, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager, State, Wry};

/// One open book: its docset plus any sidecar `.khba` attachment packs.
struct Book {
    docset: Docset,
    attachments: Vec<Attachments>,
    /// For a whole-fetched remote (a host without Range), the temp file its SQLite
    /// connection reads from — kept alive here, and deleted when the Book drops. Fields
    /// drop in order, so `docset` (the connection) closes before this file is removed.
    #[allow(dead_code)]
    temp: Option<tempfile::NamedTempFile>,
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

fn is_url(s: &str) -> bool {
    s.starts_with("http://") || s.starts_with("https://")
}

/// Open a `.khb` from a local path or an `http(s)://` URL. A remote is streamed
/// page-by-page over the Range-VFS when the host honours `Range` (the CLI `inspect`
/// fork); otherwise it's downloaded **whole** into a temp file and opened from there.
/// Either way the HTTP is native (`ureq`) — **no CORS** applies (a browser-only rule).
fn open_docset(path: &str) -> Result<(Docset, Option<tempfile::NamedTempFile>)> {
    if !is_url(path) {
        return Ok((Docset::open(Path::new(path))?, None));
    }
    match HttpRangeReader::open(path) {
        Ok(reader) => Ok((Docset::open_reader(Arc::new(reader))?, None)),
        Err(_) => {
            let bytes = http::fetch_all(path)?;
            let mut tmp = tempfile::NamedTempFile::new()?;
            std::io::Write::write_all(&mut tmp, &bytes)?;
            let ds = Docset::open(tmp.path())?;
            Ok((ds, Some(tmp)))
        }
    }
}

fn open_one(spec: &OpenSpec) -> Result<Book> {
    let (docset, temp) = open_docset(&spec.path)?;
    // Local sidecars only; a remote `.khba` would need Range support Attachments lacks yet,
    // so its assets simply show as missing (the Manage page offers "Add pack").
    let attachments = spec
        .sidecars
        .iter()
        .filter(|s| !is_url(s))
        .filter_map(|s| Attachments::open(Path::new(s)).ok())
        .collect();
    Ok(Book {
        docset,
        attachments,
        temp,
    })
}

/// Just the metadata a `DocVariant` needs — read, then the docset is dropped (closed).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DocsetMeta {
    id: String,
    language: String,
    title: String,
    collection: String,
    collection_title: String,
    version: String,
}

fn read_meta(ds: &Docset) -> Result<DocsetMeta> {
    let id = ds.id()?;
    Ok(DocsetMeta {
        collection: ds.collection()?,
        collection_title: ds.collection_title()?,
        title: ds.meta("title")?.unwrap_or_else(|| id.clone()),
        version: ds.meta("version")?.unwrap_or_default(),
        language: ds.language()?,
        id,
    })
}

/// A docset spec (path/URL + sidecar paths) returned for the bundled set.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SpecDto {
    path: String,
    sidecars: Vec<String>,
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

/// The specs (paths + co-located sidecars) of every `.khb` bundled in the app's
/// `resources/docsets/`. All bundled `.khba` are offered to each `.khb` — `asset_index`
/// routing keys by pack id, so only referenced packs are used. The frontend peeks these
/// to build variants, then opens the shown editions via `open_docsets`.
#[tauri::command]
fn bundled_specs(app: tauri::AppHandle) -> Result<Vec<SpecDto>, String> {
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
    Ok(khb
        .into_iter()
        .map(|path| SpecDto {
            path,
            sidecars: khba.clone(),
        })
        .collect())
}

/// Read just the metadata of each spec (local path or `http(s)://` URL) — used to build
/// the `DocVariant` list without opening full structure. Each docset is closed after.
/// Per-spec `None` for a spec that can't be opened (missing file / unreachable URL), so a
/// stale persisted entry doesn't break startup — the others still load.
#[tauri::command]
fn peek_docsets(specs: Vec<OpenSpec>) -> Vec<Option<DocsetMeta>> {
    specs
        .iter()
        .map(|spec| {
            // `(ds, _temp)` both live through read_meta, then drop (ds/connection first).
            open_docset(&spec.path)
                .ok()
                .and_then(|(ds, _temp)| read_meta(&ds).ok())
        })
        .collect()
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

/// The native application menu — it replaces the web menubar on desktop. Custom items
/// carry the same ids as the web menu's `data-action`s, so a click emits the id and the
/// frontend runs it through the same dispatcher. Copy/Paste/Quit/… are predefined items
/// Tauri handles natively (so the search box gets working ⌘C/⌘V).
fn build_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<Wry>> {
    let mk = |id: &str, label: &str, accel: &str| -> tauri::Result<MenuItem<Wry>> {
        let mut b = MenuItemBuilder::with_id(id, label);
        if !accel.is_empty() {
            b = b.accelerator(accel);
        }
        b.build(app)
    };

    // macOS app menu (About/Quit/Hide live here); ignored where there's no app menu.
    let app_menu = SubmenuBuilder::new(app, "KD Help Book")
        .about(None)
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;
    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&mk("open-docset", "Open docset…", "CmdOrCtrl+O")?)
        .item(&mk("open-url", "Open from URL…", "")?)
        .item(&mk("manage-docsets", "Manage docsets…", "")?)
        .separator()
        .item(&mk("print", "Print…", "CmdOrCtrl+P")?)
        .build()?;
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&mk("mode-contents", "Contents", "")?)
        .item(&mk("mode-index", "Index", "")?)
        .item(&mk("mode-search", "Search", "")?)
        .item(&mk("search-page", "Advanced search…", "")?)
        .item(&mk("mode-favorites", "Favorites", "")?)
        .separator()
        .item(&mk("sync", "Sync with Contents", "")?)
        .item(&mk("clear-highlight", "Clear search highlight", "")?)
        .separator()
        .item(&mk("font-up", "Larger text", "CmdOrCtrl+=")?)
        .item(&mk("font-down", "Smaller text", "CmdOrCtrl+-")?)
        .separator()
        .item(&mk("back", "Back", "CmdOrCtrl+[")?)
        .item(&mk("forward", "Forward", "CmdOrCtrl+]")?)
        .build()?;
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&mk("about", "About KD Help Book", "")?)
        .build()?;

    MenuBuilder::new(app)
        .items(&[&app_menu, &file_menu, &edit_menu, &view_menu, &help_menu])
        .build()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            let menu = build_menu(app.handle())?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            // Forward the clicked item's id to the frontend, which runs it through the
            // same action dispatcher as the (hidden) web menu. Predefined items also
            // perform their native action.
            let _ = app.emit("menu", event.id().0.as_str());
        })
        .invoke_handler(tauri::generate_handler![
            bundled_specs,
            peek_docsets,
            open_docsets,
            page,
            asset,
            search
        ])
        .run(tauri::generate_context!())
        .expect("error while running KD Help Book");
}
