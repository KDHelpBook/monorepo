//! `pack` and `patch`: assemble (and update) a publishable static distribution.
//!
//! A distribution is: the built viewer + a `docsets/` folder + a `docsets.json`
//! manifest the viewer loads on start + a `config.json` describing the profile.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use flate2::{write::GzEncoder, Compression};
use kdhelp_core::{build, Attachments, Docset};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct ManifestEntry {
    /// Path under the dist root. A trailing `.gz` means the file is gzip-compressed
    /// and the viewer decompresses it after fetch (works for `.khb`/`.khba`/`.khbp`).
    file: String,
    id: String,
    title: String,
    language: String,
    /// Sidecar `.khba` attachment packs backing this docset (zero or more), each an
    /// optionally-`.gz` path. The viewer opens them alongside the docset.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    attachments: Vec<String>,
}

#[derive(Serialize, Deserialize, Default)]
struct Manifest {
    docsets: Vec<ManifestEntry>,
}

/// Routing for a docset's attachment packs: each pack's stable id (`meta.pack`)
/// paired with the asset paths it holds.
type PackRouting = Vec<(String, Vec<String>)>;

#[derive(Serialize)]
struct Config {
    #[serde(rename = "externalSources")]
    external_sources: bool,
    pwa: bool,
    /// The landing view on a cold start: a page id (`docsetId:localId`) or the
    /// literal `"search"`. Omitted → the viewer defaults to the Search page.
    #[serde(skip_serializing_if = "Option::is_none")]
    home: Option<String>,
}

/// Options for [`pack`].
pub struct PackOptions {
    pub viewer: PathBuf,
    pub docsets: Vec<PathBuf>,
    pub out: PathBuf,
    pub compact: bool,
    pub external_sources: bool,
    pub pwa: bool,
    /// Landing view: a page id, `"search"`, or `None` (viewer defaults to search).
    pub home: Option<String>,
}

/// Assemble a fresh distribution at `out`.
pub fn pack(opts: &PackOptions) -> Result<()> {
    if !opts.viewer.is_dir() {
        bail!("viewer dist not found: {}", opts.viewer.display());
    }
    copy_dir(&opts.viewer, &opts.out)?;

    // Start from a clean slate: a dev build may have copied its own docsets +
    // manifest + config from `public/`, which pack fully controls.
    let _ = fs::remove_file(opts.out.join("docsets.json"));
    let _ = fs::remove_file(opts.out.join("config.json"));
    let docsets_dir = opts.out.join("docsets");
    let _ = fs::remove_dir_all(&docsets_dir);
    fs::create_dir_all(&docsets_dir)?;
    let mut manifest = Manifest::default();
    for docset in &opts.docsets {
        manifest
            .docsets
            .push(add_docset(docset, &docsets_dir, opts.compact)?);
    }

    write_json(&opts.out.join("docsets.json"), &manifest)?;
    write_json(
        &opts.out.join("config.json"),
        &Config {
            external_sources: opts.external_sources,
            pwa: opts.pwa,
            home: opts.home.clone(),
        },
    )?;
    println!(
        "packed {} docset(s) + viewer -> {}",
        opts.docsets.len(),
        opts.out.display()
    );
    Ok(())
}

/// Add or replace docsets in an already-built distribution, updating its manifest.
pub fn patch(dist: &Path, docsets: &[PathBuf], compact: bool) -> Result<()> {
    let manifest_path = dist.join("docsets.json");
    let mut manifest: Manifest = if manifest_path.exists() {
        serde_json::from_str(&fs::read_to_string(&manifest_path)?)
            .with_context(|| format!("parsing {}", manifest_path.display()))?
    } else {
        Manifest::default()
    };

    let docsets_dir = dist.join("docsets");
    fs::create_dir_all(&docsets_dir)?;
    for docset in docsets {
        let entry = add_docset(docset, &docsets_dir, compact)?;
        manifest.docsets.retain(|e| e.id != entry.id); // replace same id
        manifest.docsets.push(entry);
    }
    write_json(&manifest_path, &manifest)?;
    println!(
        "patched {} docset(s) into {}",
        docsets.len(),
        dist.display()
    );
    Ok(())
}

/// Copy a docset into `docsets/` (optionally gzip'd as `.khbc`) and return its
/// manifest entry, with metadata read from the docset itself.
fn add_docset(khb: &Path, docsets_dir: &Path, compact: bool) -> Result<ManifestEntry> {
    let ds = Docset::open(khb).with_context(|| format!("opening {}", khb.display()))?;
    let id = ds.id()?;
    let title = ds.meta("title")?.unwrap_or_else(|| id.clone());
    let language = ds.language()?;
    let name = khb
        .file_name()
        .and_then(|n| n.to_str())
        .context("docset path has no file name")?
        .to_string();

    // Copy the .khb into the dist (plain), gather its attachment packs, and rewrite
    // its routing index so it covers the full set of packs we are bundling — then
    // materialize the shipped form, gzip'd to `<name>.gz` when compact.
    let dest_khb = docsets_dir.join(&name);
    fs::copy(khb, &dest_khb)?;
    let (attachments, mut entries) = collect_attachments(khb, docsets_dir, compact)?;
    entries.insert(0, (String::new(), ds.asset_paths()?)); // embedded store, first
    if entries.iter().any(|(_, paths)| !paths.is_empty()) {
        build::rebuild_asset_index(&dest_khb, &entries)
            .with_context(|| format!("indexing assets in {}", dest_khb.display()))?;
    }

    let file = if compact {
        let gz = gzip(&fs::read(&dest_khb)?)?;
        let gz_name = format!("{name}.gz"); // foo.khb -> foo.khb.gz
        fs::write(docsets_dir.join(&gz_name), gz)?;
        fs::remove_file(&dest_khb)?;
        format!("docsets/{gz_name}")
    } else {
        format!("docsets/{name}")
    };

    Ok(ManifestEntry {
        file,
        id,
        title,
        language,
        attachments,
    })
}

/// Copy every sidecar `.khba` attachment pack that belongs to `khb` into `docsets/`
/// (gzip'd to `<name>.gz` when compact). A docset `foo.khb` owns `foo.khba` **and**
/// any `foo.<tag>.khba` (so several packs can back one docset). Returns their manifest
/// paths and, per pack, its stable id (`meta.pack`) with the asset paths it holds —
/// the routing the `.khb` index needs (read from the uncompressed source).
fn collect_attachments(
    khb: &Path,
    docsets_dir: &Path,
    compact: bool,
) -> Result<(Vec<String>, PackRouting)> {
    let parent = match khb.parent() {
        Some(p) if !p.as_os_str().is_empty() => p.to_path_buf(),
        _ => PathBuf::from("."),
    };
    let stem = match khb.file_stem().and_then(|s| s.to_str()) {
        Some(s) => s,
        None => return Ok((Vec::new(), Vec::new())),
    };
    let prefix = format!("{stem}.");

    let mut paths: Vec<PathBuf> = fs::read_dir(&parent)
        .with_context(|| format!("reading {}", parent.display()))?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with(&prefix) && n.ends_with(".khba"))
        })
        .collect();
    paths.sort();

    let mut manifest = Vec::new();
    let mut entries = Vec::new();
    for path in paths {
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .expect("filtered filename is valid utf-8");
        // Routing metadata comes from the uncompressed source pack.
        let att =
            Attachments::open(&path).with_context(|| format!("opening {}", path.display()))?;
        let pack = att.pack_id()?.unwrap_or_else(|| name.to_string());
        entries.push((pack, att.asset_paths()?));

        let dest_name = if compact {
            let gz = gzip(&fs::read(&path)?)?;
            let gz_name = format!("{name}.gz");
            fs::write(docsets_dir.join(&gz_name), gz)?;
            gz_name
        } else {
            fs::copy(&path, docsets_dir.join(name))?;
            name.to_string()
        };
        manifest.push(format!("docsets/{dest_name}"));
    }
    Ok((manifest, entries))
}

fn gzip(data: &[u8]) -> Result<Vec<u8>> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::best());
    encoder.write_all(data)?;
    Ok(encoder.finish()?)
}

fn copy_dir(src: &Path, dst: &Path) -> Result<()> {
    for entry in walkdir::WalkDir::new(src) {
        let entry = entry?;
        let rel = entry
            .path()
            .strip_prefix(src)
            .expect("walkdir entry under src");
        let target = dst.join(rel);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&target)?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<()> {
    fs::write(path, serde_json::to_string_pretty(value)? + "\n")
        .with_context(|| format!("writing {}", path.display()))
}
