//! The bundled Markdown source loader: a directory of Markdown + YAML → [`SourceDocset`].
//!
//! Layout of a source directory:
//! ```text
//! docset.toml        # id, title, version, language
//! categories.yaml    # optional: [{ id, title }, …]
//! toc.yaml           # optional: nested [{ page, title?, children }, …]
//! pages/*.md         # pages with YAML frontmatter (id?, title?, keywords[], categories[])
//! ```
//! `pages/` is optional — if absent, `*.md` anywhere under the directory are used.
//! If `toc.yaml` is absent, a flat table of contents in filename order is produced.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

use anyhow::{bail, Context, Result};
use serde::Deserialize;
use walkdir::WalkDir;

use crate::model::{Asset, Category, SourceDocset, SourcePage, TocNode};
use crate::{assets, markdown};

#[derive(Deserialize)]
struct DocsetToml {
    id: String,
    title: String,
    #[serde(default = "default_version")]
    version: String,
    #[serde(default = "default_language")]
    language: String,
    /// Optional product/family this book belongs to (defaults to `id`).
    #[serde(default)]
    collection: Option<String>,
    /// Optional family display title (defaults to `title`).
    #[serde(default)]
    collection_title: Option<String>,
}
fn default_version() -> String {
    "0.1.0".to_string()
}
fn default_language() -> String {
    "en".to_string()
}

#[derive(Deserialize)]
struct CategoryYaml {
    id: String,
    title: String,
}

#[derive(Deserialize)]
struct TocYaml {
    page: String,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    children: Vec<TocYaml>,
}

#[derive(Deserialize, Default)]
struct Frontmatter {
    id: Option<String>,
    title: Option<String>,
    #[serde(default)]
    keywords: Vec<String>,
    #[serde(default)]
    categories: Vec<String>,
    /// Ids of related pages (within this book) for a "See also" footer.
    #[serde(default)]
    related: Vec<String>,
}

/// Load a source directory into a [`SourceDocset`], ready for [`crate::build::build_khb`].
pub fn load_dir(dir: &Path) -> Result<SourceDocset> {
    let manifest_path = dir.join("docset.toml");
    let manifest: DocsetToml = toml::from_str(
        &fs::read_to_string(&manifest_path)
            .with_context(|| format!("reading {}", manifest_path.display()))?,
    )
    .with_context(|| format!("parsing {}", manifest_path.display()))?;

    let mut categories = load_categories(dir)?;
    let pages = load_pages(dir)?;
    if pages.is_empty() {
        bail!("no pages (*.md) found under {}", dir.display());
    }

    // Auto-register any category referenced by a page but not declared.
    let mut known: BTreeSet<String> = categories.iter().map(|c| c.id.clone()).collect();
    for page in &pages {
        for category in &page.categories {
            if known.insert(category.clone()) {
                categories.push(Category {
                    id: category.clone(),
                    title: category.clone(),
                });
            }
        }
    }

    let toc = load_toc(dir, &pages)?;
    let page_ids: BTreeSet<&str> = pages.iter().map(|p| p.id.as_str()).collect();
    validate_toc(&toc, &page_ids)?;
    for page in &pages {
        for related in &page.related {
            // Cross-book links (`docsetId:localId`) can't be checked here — the other
            // book is compiled separately; the viewer hides them if unresolved. Only
            // validate within-book ids (no `:`), to catch typos.
            if !related.contains(':') && !page_ids.contains(related.as_str()) {
                bail!(
                    "page `{}` lists unknown related page `{}`",
                    page.id,
                    related
                );
            }
        }
    }
    let assets = load_assets(dir)?;

    let collection = manifest.collection.unwrap_or_else(|| manifest.id.clone());
    let collection_title = manifest
        .collection_title
        .unwrap_or_else(|| manifest.title.clone());
    Ok(SourceDocset {
        id: manifest.id,
        title: manifest.title,
        version: manifest.version,
        language: manifest.language,
        collection,
        collection_title,
        pages,
        toc,
        categories,
        assets,
    })
}

/// Collect every file under `assets/` into an [`Asset`], keyed by its docset-relative
/// path (`assets/…`). Both inline images and downloadable attachments live here.
fn load_assets(dir: &Path) -> Result<Vec<Asset>> {
    let base = dir.join(assets::ASSETS_DIR);
    if !base.is_dir() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    for entry in WalkDir::new(&base).sort_by_file_name() {
        let entry = entry?;
        if !entry.file_type().is_file() {
            continue;
        }
        let rel = entry
            .path()
            .strip_prefix(dir)
            .expect("asset under source dir");
        // Store forward-slash paths regardless of host separator.
        let path = rel
            .components()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/");
        let data = fs::read(entry.path())
            .with_context(|| format!("reading asset {}", entry.path().display()))?;
        out.push(Asset {
            mime: assets::guess_mime(&path).to_string(),
            path,
            data,
        });
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

fn load_categories(dir: &Path) -> Result<Vec<Category>> {
    let path = dir.join("categories.yaml");
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw: Vec<CategoryYaml> = serde_yaml::from_str(&fs::read_to_string(&path)?)
        .with_context(|| format!("parsing {}", path.display()))?;
    Ok(raw
        .into_iter()
        .map(|c| Category {
            id: c.id,
            title: c.title,
        })
        .collect())
}

fn load_pages(dir: &Path) -> Result<Vec<SourcePage>> {
    let pages_dir = dir.join("pages");
    let base = if pages_dir.is_dir() {
        pages_dir
    } else {
        dir.to_path_buf()
    };

    let mut files: Vec<_> = WalkDir::new(&base)
        .sort_by_file_name()
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| e.path().extension().is_some_and(|x| x == "md"))
        .map(|e| e.into_path())
        .collect();
    files.sort();

    let mut pages = Vec::new();
    for path in files {
        let raw =
            fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))?;
        let (frontmatter, body) =
            split_frontmatter(&raw).with_context(|| format!("parsing {}", path.display()))?;
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_string();
        let id = frontmatter.id.clone().unwrap_or_else(|| slug(&stem));
        let title = frontmatter
            .title
            .clone()
            .or_else(|| markdown::first_h1(&body))
            .unwrap_or_else(|| stem.clone());
        pages.push(SourcePage {
            id,
            title,
            markdown: body,
            keywords: frontmatter.keywords,
            categories: frontmatter.categories,
            related: frontmatter.related,
        });
    }
    Ok(pages)
}

/// Split an optional leading `--- … ---` YAML frontmatter block from the body.
fn split_frontmatter(raw: &str) -> Result<(Frontmatter, String)> {
    let text = raw.strip_prefix('\u{feff}').unwrap_or(raw);
    if let Some(rest) = text.strip_prefix("---\n") {
        let end = rest
            .find("\n---")
            .context("unterminated frontmatter block")?;
        let yaml = &rest[..end];
        let after = &rest[end + "\n---".len()..];
        // Skip the remainder of the closing `---` line; the body is what follows.
        let body = match after.find('\n') {
            Some(nl) => after[nl + 1..].to_string(),
            None => String::new(),
        };
        let frontmatter: Frontmatter =
            serde_yaml::from_str(yaml).context("parsing frontmatter YAML")?;
        return Ok((frontmatter, body));
    }
    Ok((Frontmatter::default(), text.to_string()))
}

fn load_toc(dir: &Path, pages: &[SourcePage]) -> Result<Vec<TocNode>> {
    let path = dir.join("toc.yaml");
    if path.exists() {
        let raw: Vec<TocYaml> = serde_yaml::from_str(&fs::read_to_string(&path)?)
            .with_context(|| format!("parsing {}", path.display()))?;
        let titles: BTreeMap<&str, &str> = pages
            .iter()
            .map(|p| (p.id.as_str(), p.title.as_str()))
            .collect();
        return Ok(raw.iter().map(|n| toc_from_yaml(n, &titles)).collect());
    }
    // Fallback: flat TOC in page order.
    Ok(pages
        .iter()
        .map(|p| TocNode {
            page_id: p.id.clone(),
            title: p.title.clone(),
            children: Vec::new(),
        })
        .collect())
}

fn toc_from_yaml(node: &TocYaml, titles: &BTreeMap<&str, &str>) -> TocNode {
    let title = node
        .title
        .clone()
        .or_else(|| titles.get(node.page.as_str()).map(|s| s.to_string()))
        .unwrap_or_else(|| node.page.clone());
    TocNode {
        page_id: node.page.clone(),
        title,
        children: node
            .children
            .iter()
            .map(|c| toc_from_yaml(c, titles))
            .collect(),
    }
}

fn validate_toc(nodes: &[TocNode], page_ids: &BTreeSet<&str>) -> Result<()> {
    for node in nodes {
        if !page_ids.contains(node.page_id.as_str()) {
            bail!("toc references unknown page id `{}`", node.page_id);
        }
        validate_toc(&node.children, page_ids)?;
    }
    Ok(())
}

fn slug(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect()
}
