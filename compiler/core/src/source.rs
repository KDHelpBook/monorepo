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

use crate::model::{Asset, Category, Extension, Product, SourceDocset, SourcePage, TocNode};
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
    /// Optional products this book belongs to (many-to-many; `[[products]]` tables
    /// with `id`/`title`). Defaults to a single product named after the collection.
    #[serde(default)]
    products: Vec<Product>,
    /// Optional external block transformers, keyed by the `<name>` that triggers them
    /// (`[extensions.<name>]` tables). Absence is a no-op. See [`Extension`].
    #[serde(default)]
    extensions: std::collections::BTreeMap<String, ExtensionToml>,
}

/// One `[extensions.<name>]` table in `docset.toml`.
#[derive(Deserialize)]
struct ExtensionToml {
    /// Executable to run: a bare name (resolved on `PATH`) or a path (made absolute
    /// against the source dir).
    command: String,
    /// Fixed CLI arguments passed on every invocation.
    #[serde(default)]
    args: Vec<String>,
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

/// A `toc.yaml` node: `page` + optional display `title`, or — a pure folder node —
/// a `title` alone with `children` (no page to open).
#[derive(Deserialize)]
struct TocYaml {
    #[serde(default)]
    page: Option<String>,
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
    /// Force the on-page "On this page" table of contents on/off. Omitted → auto
    /// (shown only when the page has several sections).
    #[serde(default)]
    toc: Option<bool>,
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

    let extensions = load_extensions(dir, manifest.extensions)?;

    let collection = manifest.collection.unwrap_or_else(|| manifest.id.clone());
    let collection_title = manifest
        .collection_title
        .unwrap_or_else(|| manifest.title.clone());
    // No explicit products → one named after the collection, so the product scope
    // keeps working for books that don't opt into the many-to-many facet.
    let products = if manifest.products.is_empty() {
        vec![Product {
            id: collection.clone(),
            title: collection_title.clone(),
        }]
    } else {
        manifest.products
    };
    Ok(SourceDocset {
        id: manifest.id,
        title: manifest.title,
        version: manifest.version,
        language: manifest.language,
        collection,
        collection_title,
        products,
        pages,
        toc,
        categories,
        assets,
        extensions,
    })
}

/// Turn the `[extensions.*]` tables into validated [`Extension`]s. Each name must be
/// non-empty and free of `:` / whitespace (it lives in the ` ```ext:<name> ` fence and is
/// matched by exact string). A `command` that looks like a path (contains a separator or
/// starts with `.`) is resolved against the source dir so a docset can ship its own tool;
/// a bare name is left for `PATH` lookup at spawn time.
fn load_extensions(dir: &Path, tables: BTreeMap<String, ExtensionToml>) -> Result<Vec<Extension>> {
    let mut extensions = Vec::with_capacity(tables.len());
    for (name, table) in tables {
        if name.is_empty() || name.contains(':') || name.chars().any(char::is_whitespace) {
            bail!("invalid extension name `{name}` (must be non-empty, no `:` or whitespace)");
        }
        if table.command.is_empty() {
            bail!("extension `{name}` has an empty `command`");
        }
        let command = resolve_extension_command(dir, &table.command);
        extensions.push(Extension {
            name,
            command,
            args: table.args,
        });
    }
    Ok(extensions)
}

/// Resolve an extension's `command`. A bare name (`khb-label`) is left for `PATH` lookup. A
/// path (contains a separator or starts with `.`) is made **absolute** against the source
/// dir — so it runs no matter the child's working directory, which is the page's own folder
/// (a relative program path would otherwise resolve against that folder and be missed).
fn resolve_extension_command(dir: &Path, command: &str) -> String {
    let looks_like_path =
        command.contains('/') || command.contains('\\') || command.starts_with('.');
    if !looks_like_path {
        return command.to_string();
    }
    let rel = command.strip_prefix("./").unwrap_or(command);
    let joined = dir.join(rel);
    let abs = if joined.is_absolute() {
        joined
    } else {
        std::env::current_dir().unwrap_or_default().join(joined)
    };
    abs.to_string_lossy().into_owned()
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
        // Path relative to the source root, forward-slashed (same as `load_assets`),
        // so extensions can resolve a block's file argument relative to this page.
        let source_path = path
            .strip_prefix(dir)
            .unwrap_or(&path)
            .components()
            .map(|c| c.as_os_str().to_string_lossy())
            .collect::<Vec<_>>()
            .join("/");
        pages.push(SourcePage {
            id,
            title,
            markdown: body,
            keywords: frontmatter.keywords,
            categories: frontmatter.categories,
            related: frontmatter.related,
            toc: frontmatter.toc,
            source_path: Some(source_path),
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
        return raw.iter().map(|n| toc_from_yaml(n, &titles)).collect();
    }
    // Fallback: flat TOC in page order.
    Ok(pages
        .iter()
        .map(|p| TocNode {
            page_id: Some(p.id.clone()),
            title: p.title.clone(),
            children: Vec::new(),
        })
        .collect())
}

fn toc_from_yaml(node: &TocYaml, titles: &BTreeMap<&str, &str>) -> Result<TocNode> {
    let title = match (&node.page, &node.title) {
        // A page node falls back to the page's own title, then to its id.
        (Some(page), title) => title
            .clone()
            .or_else(|| titles.get(page.as_str()).map(|s| s.to_string()))
            .unwrap_or_else(|| page.clone()),
        // A folder node has no page to inherit a label from.
        (None, Some(title)) => title.clone(),
        (None, None) => bail!("a toc folder node (no `page`) needs a `title`"),
    };
    Ok(TocNode {
        page_id: node.page.clone(),
        title,
        children: node
            .children
            .iter()
            .map(|c| toc_from_yaml(c, titles))
            .collect::<Result<Vec<_>>>()?,
    })
}

fn validate_toc(nodes: &[TocNode], page_ids: &BTreeSet<&str>) -> Result<()> {
    for node in nodes {
        if let Some(page_id) = &node.page_id {
            if !page_ids.contains(page_id.as_str()) {
                bail!("toc references unknown page id `{}`", page_id);
            }
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

#[cfg(test)]
mod tests {
    use super::*;

    /// A minimal on-disk source: docset.toml + two pages + the given toc.yaml.
    fn write_source(dir: &Path, toc_yaml: Option<&str>) {
        fs::write(
            dir.join("docset.toml"),
            "id = \"t\"\ntitle = \"T\"\nversion = \"1\"\nlanguage = \"en\"\n",
        )
        .unwrap();
        let pages = dir.join("pages");
        fs::create_dir(&pages).unwrap();
        fs::write(pages.join("a.md"), "# A\n\nbody").unwrap();
        fs::write(pages.join("b.md"), "# B\n\nbody").unwrap();
        if let Some(y) = toc_yaml {
            fs::write(dir.join("toc.yaml"), y).unwrap();
        }
    }

    #[test]
    fn toc_yaml_folder_node_groups_children() {
        let dir = tempfile::tempdir().unwrap();
        write_source(
            dir.path(),
            Some("- page: a\n- title: Group\n  children:\n    - page: b\n"),
        );
        let src = load_dir(dir.path()).unwrap();
        assert_eq!(src.toc.len(), 2);
        assert_eq!(src.toc[0].page_id.as_deref(), Some("a"));
        let folder = &src.toc[1];
        assert_eq!(folder.page_id, None);
        assert_eq!(folder.title, "Group");
        assert_eq!(folder.children.len(), 1);
        assert_eq!(folder.children[0].page_id.as_deref(), Some("b"));
    }

    #[test]
    fn toc_yaml_folder_node_requires_a_title() {
        let dir = tempfile::tempdir().unwrap();
        write_source(dir.path(), Some("- children:\n    - page: a\n"));
        let err = load_dir(dir.path()).unwrap_err().to_string();
        assert!(err.contains("needs a `title`"), "unexpected error: {err}");
    }

    #[test]
    fn parses_extension_tables() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("docset.toml"),
            "id = \"t\"\ntitle = \"T\"\n\n\
             [extensions.label]\ncommand = \"khb-label\"\nargs = [\"--theme\", \"dark\"]\n\
             [extensions.chart]\ncommand = \"./tools/chart\"\n",
        )
        .unwrap();
        let pages = dir.path().join("pages");
        fs::create_dir(&pages).unwrap();
        fs::write(pages.join("a.md"), "# A\n\nbody").unwrap();
        let src = load_dir(dir.path()).unwrap();

        let label = src.extensions.iter().find(|e| e.name == "label").unwrap();
        assert_eq!(label.command, "khb-label"); // bare name → left for PATH lookup
        assert_eq!(label.args, vec!["--theme", "dark"]);

        // A path-like command is resolved against the source dir.
        let chart = src.extensions.iter().find(|e| e.name == "chart").unwrap();
        assert!(chart.command.ends_with("tools/chart"));
        assert!(Path::new(&chart.command).is_absolute());
    }

    #[test]
    fn extension_command_resolves_to_absolute() {
        // A bare name is left for PATH lookup.
        assert_eq!(
            resolve_extension_command(Path::new("some/dir"), "khb-label"),
            "khb-label"
        );
        // A *relative* source dir + a relative command → an absolute path, so the tool runs
        // even though the child's cwd is the page folder (the bug the swatch example hit).
        let out = resolve_extension_command(Path::new("examples/demo"), "./tool.sh");
        assert!(
            Path::new(&out).is_absolute(),
            "expected absolute, got {out}"
        );
        assert!(out.ends_with("examples/demo/tool.sh"), "got {out}");
        // An absolute source dir is used as-is.
        assert_eq!(
            resolve_extension_command(Path::new("/opt/docs"), "./bin/gen"),
            "/opt/docs/bin/gen"
        );
    }

    #[test]
    fn rejects_extension_name_with_colon() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(
            dir.path().join("docset.toml"),
            "id = \"t\"\ntitle = \"T\"\n\n[extensions.\"ext:label\"]\ncommand = \"x\"\n",
        )
        .unwrap();
        let pages = dir.path().join("pages");
        fs::create_dir(&pages).unwrap();
        fs::write(pages.join("a.md"), "# A\n\nbody").unwrap();
        let err = load_dir(dir.path()).unwrap_err().to_string();
        assert!(
            err.contains("invalid extension name"),
            "unexpected error: {err}"
        );
    }
}
