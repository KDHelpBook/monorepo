//! `pack` and `patch`: assemble (and update) a publishable static distribution.
//!
//! A distribution is: the built viewer + a `docsets/` folder + a `docsets.json`
//! manifest the viewer loads on start + a `config.json` describing the profile.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use flate2::{write::GzEncoder, Compression};
use kdhelp_core::Docset;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct ManifestEntry {
    file: String,
    id: String,
    title: String,
    language: String,
    mode: String,
}

#[derive(Serialize, Deserialize, Default)]
struct Manifest {
    docsets: Vec<ManifestEntry>,
}

#[derive(Serialize)]
struct Config {
    #[serde(rename = "externalSources")]
    external_sources: bool,
    pwa: bool,
}

/// Options for [`pack`].
pub struct PackOptions {
    pub viewer: PathBuf,
    pub docsets: Vec<PathBuf>,
    pub out: PathBuf,
    pub compact: bool,
    pub external_sources: bool,
    pub pwa: bool,
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

    let (file, mode) = if compact {
        let gz = gzip(&fs::read(khb)?)?;
        let compact_name = format!("{name}c"); // foo.khb -> foo.khbc
        fs::write(docsets_dir.join(&compact_name), gz)?;
        (format!("docsets/{compact_name}"), "compact")
    } else {
        fs::copy(khb, docsets_dir.join(&name))?;
        (format!("docsets/{name}"), "khb")
    };

    Ok(ManifestEntry {
        file,
        id,
        title,
        language,
        mode: mode.to_string(),
    })
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
