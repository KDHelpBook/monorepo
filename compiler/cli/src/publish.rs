//! `pack` and `patch`: assemble (and update) a publishable static distribution.
//!
//! A distribution is: the built viewer + a `docsets/` folder + a `docsets.json`
//! manifest the viewer loads on start + a `config.json` describing the profile.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use flate2::{write::GzEncoder, Compression};
use khb_core::{build, Attachments, Docset};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct ManifestEntry {
    /// Path under the dist root. A trailing `.gz` means the file is gzip-compressed
    /// and the viewer decompresses it after fetch (works for `.khb`/`.khba`/`.khbp`).
    file: String,
    id: String,
    title: String,
    language: String,
    /// Product/family key (`meta.collection`). Books sharing it are the same product
    /// across languages/versions — the viewer uses it to pick one language variant
    /// per collection (preferring the UI language, else a fallback).
    #[serde(default)]
    collection: String,
    /// Content version (`meta.version`), surfaced in the viewer. Empty if unset.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    version: String,
    /// Sidecar `.khba` attachment packs backing this docset (zero or more), each an
    /// optionally-`.gz` path. The viewer opens them alongside the docset.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    attachments: Vec<String>,
    /// Opt-in page-level streaming (`--stream`): the viewer opens this docset over
    /// HTTP `Range` instead of downloading it whole, falling back to a whole fetch
    /// when the host doesn't honour Range. Streamed files ship uncompressed.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    streaming: bool,
    /// Short content hash of the shipped file (of the exact bytes the viewer
    /// fetches). The viewer appends it to the docset URL as `?v=<hash>`, so a
    /// rebuilt same-named book gets a distinct HTTP-cache key — a cached stale
    /// byte range can't then mix with a fresh one into a malformed SQLite image
    /// (the failure that blanks a re-deployed streamed preview) — while an
    /// *unchanged* book keeps its key, and its cache, across deploys.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    hash: String,
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
    /// Default for the viewer's "keep streamed books offline" toggle: when true, a
    /// streamed book is also downloaded whole in the background and cached, so
    /// later loads open it from cache/offline. A per-device user setting overrides
    /// it. Omitted when false so older viewers ignore it.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    prefetch: bool,
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
    /// Also emit `llms.txt` + `llms-full.txt` + per-page Markdown (AI-facing export).
    pub llms: bool,
    /// Absolute base URL of the deploy (trailing slash added if missing). When set
    /// alongside `llms`, the export also writes `sitemap.xml` + `robots.txt` — the
    /// crawler-facing discovery layer that turns the exported `.md` into findable
    /// URLs. `None` skips those two (the relative in-page hooks still work).
    pub base_url: Option<String>,
    /// `--stream`: `None` = no streaming, `Some([])` = mark every docset, else mark
    /// only the listed `--docset` paths.
    pub stream: Option<Vec<PathBuf>>,
    /// `--prefetch`: the default for the viewer's "keep streamed books offline"
    /// toggle (written into `config.json`).
    pub prefetch: bool,
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
    let stream = stream_flags(&opts.stream, &opts.docsets)?;
    for (docset, stream) in opts.docsets.iter().zip(stream) {
        manifest
            .docsets
            .push(add_docset(docset, &docsets_dir, opts.compact, stream)?);
    }

    write_json(&opts.out.join("docsets.json"), &manifest)?;
    write_json(
        &opts.out.join("config.json"),
        &Config {
            external_sources: opts.external_sources,
            pwa: opts.pwa,
            home: opts.home.clone(),
            prefetch: opts.prefetch,
        },
    )?;
    if opts.llms {
        write_llms(&opts.out, &opts.docsets, opts.base_url.as_deref())?;
        // Only now, with the export actually on disk, wire the discovery hooks into
        // index.html — so a non-llms (or dev) build never advertises files it lacks.
        inject_llms_hooks(&opts.out, opts.base_url.is_some())?;
    } else {
        strip_llms_markers(&opts.out)?;
    }
    println!(
        "packed {} docset(s) + viewer -> {}",
        opts.docsets.len(),
        opts.out.display()
    );
    Ok(())
}

/// The inert marker comments the viewer template carries; `pack` swaps them for the
/// real discovery hooks under `--llms`, or strips them otherwise. Kept as exact
/// strings so a third-party viewer without them is simply left untouched.
const LLMS_HEAD_MARKER: &str = "<!--llms-discovery:head-->";
const LLMS_BODY_MARKER: &str = "<!--llms-discovery:body-->";

/// Replace the `index.html` discovery markers with the real hooks: a
/// `<link rel="llms-txt">` (always, since `--llms` writes llms.txt) plus the
/// sitemap `<link>` and the `<noscript>` landing block. `has_sitemap` (i.e.
/// `--base-url` was given, so sitemap.xml exists) gates the sitemap bits. Tolerant:
/// a dist whose index.html lacks the markers is left as-is with a note.
fn inject_llms_hooks(out: &Path, has_sitemap: bool) -> Result<()> {
    let path = out.join("index.html");
    let Ok(html) = fs::read_to_string(&path) else {
        println!("note: no index.html in the viewer dist — skipped discovery hooks");
        return Ok(());
    };
    if !html.contains(LLMS_HEAD_MARKER) && !html.contains(LLMS_BODY_MARKER) {
        println!("note: index.html has no llms-discovery markers — skipped hooks");
        return Ok(());
    }
    let html = html
        .replace(LLMS_HEAD_MARKER, &head_hooks(has_sitemap))
        .replace(LLMS_BODY_MARKER, &noscript_block(has_sitemap));
    fs::write(&path, html).with_context(|| format!("writing {}", path.display()))?;
    println!("injected AI-discovery hooks into index.html");
    Ok(())
}

/// Remove the discovery markers for a non-`--llms` pack, so the output carries no
/// dangling placeholder comments (and never any dead links).
fn strip_llms_markers(out: &Path) -> Result<()> {
    let path = out.join("index.html");
    let Ok(html) = fs::read_to_string(&path) else {
        return Ok(());
    };
    if !html.contains(LLMS_HEAD_MARKER) && !html.contains(LLMS_BODY_MARKER) {
        return Ok(());
    }
    let html = html
        .replace(LLMS_HEAD_MARKER, "")
        .replace(LLMS_BODY_MARKER, "");
    fs::write(&path, html).with_context(|| format!("writing {}", path.display()))?;
    Ok(())
}

/// The `<head>` hooks: the llms.txt link always, the sitemap link only when
/// sitemap.xml was emitted. Relative hrefs (resolve at the deploy base).
fn head_hooks(has_sitemap: bool) -> String {
    let mut s = String::from(r#"<link rel="llms-txt" href="llms.txt" />"#);
    if has_sitemap {
        s.push_str("\n    <link rel=\"sitemap\" type=\"application/xml\" href=\"sitemap.xml\" />");
    }
    s
}

/// The `<noscript>` landing block handed to JS-less crawlers: a title, a line of
/// prose, and links to the static exports. The sitemap entry appears only when
/// sitemap.xml exists.
fn noscript_block(has_sitemap: bool) -> String {
    let sitemap_li = if has_sitemap {
        "\n          <li><a href=\"sitemap.xml\">sitemap.xml</a> — every crawlable page URL</li>"
    } else {
        ""
    };
    format!(
        "<noscript>\n\
         \x20     <div class=\"bot-index\">\n\
         \x20       <h1>KD Help Book</h1>\n\
         \x20       <p>A documentation reader. This page is a client-side application and needs JavaScript to run. Machine-readable copies of the documentation are available as static files:</p>\n\
         \x20       <ul>\n\
         \x20         <li><a href=\"llms.txt\">llms.txt</a> — an index of every page, linking to its clean-Markdown copy</li>\n\
         \x20         <li><a href=\"llms-full.txt\">llms-full.txt</a> — the full documentation inline, for one-shot ingestion</li>{sitemap_li}\n\
         \x20       </ul>\n\
         \x20     </div>\n\
         \x20   </noscript>"
    )
}

/// Emit the `llms.txt` family into the dist root: the link index, the full inline
/// concatenation, and per-page Markdown under `md/<docset>/<page>.md`. Plain text
/// even in compact mode — these are meant to be fetched and read as-is. With a
/// `base_url`, also write the crawler-facing discovery layer (`sitemap.xml` +
/// `robots.txt`) so those `.md` become findable URLs, not just llms.txt entries.
fn write_llms(out: &Path, docsets: &[PathBuf], base_url: Option<&str>) -> Result<()> {
    let opened = docsets
        .iter()
        .map(|p| Docset::open(p).with_context(|| format!("opening {}", p.display())))
        .collect::<Result<Vec<_>>>()?;
    let refs: Vec<&Docset> = opened.iter().collect();
    let export = khb_core::llms::export(&refs, None)?;

    fs::write(out.join("llms.txt"), &export.index)?;
    fs::write(out.join("llms-full.txt"), &export.full)?;
    for page in &export.pages {
        let path = out.join(&page.path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::write(&path, &page.content)?;
    }
    println!(
        "wrote llms.txt + llms-full.txt + {} page file(s)",
        export.pages.len()
    );

    match base_url {
        Some(raw) => {
            let base = normalize_base(raw);
            // Sitemap lists every static, crawlable URL of the export: the landing
            // page, the two llms.txt files, and each per-page `.md` — everything a
            // crawler could actually fetch (hash routes can't appear; they're
            // fragments the server never sees).
            let mut paths = vec![
                String::new(), // the landing (base itself)
                "llms.txt".to_string(),
                "llms-full.txt".to_string(),
            ];
            paths.extend(export.pages.iter().map(|p| p.path.clone()));
            fs::write(out.join("sitemap.xml"), sitemap_xml(&base, &paths))?;
            fs::write(out.join("robots.txt"), robots_txt(&base))?;
            println!("wrote sitemap.xml + robots.txt (base {base})");
        }
        None => {
            println!(
                "no --base-url: skipped sitemap.xml + robots.txt \
                 (relative in-page hooks still emitted by the viewer)"
            );
        }
    }
    Ok(())
}

/// Ensure the base URL ends in a single `/`, so joining a relative path is plain
/// concatenation (`base + "md/x.md"`).
fn normalize_base(base: &str) -> String {
    let trimmed = base.trim_end_matches('/');
    format!("{trimmed}/")
}

/// XML-escape a `<loc>` value. Export paths are already sanitized to
/// `[A-Za-z0-9._-/]`, but a user-supplied base URL might carry `&`, so escape
/// defensively to keep the sitemap well-formed.
fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// Build `sitemap.xml` from absolute URLs (`base` + each relative path). Listing
/// the real `.md` files is what makes the docs crawlable on a hash-routed SPA —
/// they're the only genuine, fetchable URLs.
fn sitemap_xml(base: &str, paths: &[String]) -> String {
    let mut out = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n",
    );
    for path in paths {
        let loc = xml_escape(&format!("{base}{path}"));
        out.push_str(&format!("  <url><loc>{loc}</loc></url>\n"));
    }
    out.push_str("</urlset>\n");
    out
}

/// Build `robots.txt`: don't block anyone (AI crawlers named explicitly for
/// clarity, then a catch-all), and advertise the sitemap by absolute URL.
///
/// Caveat baked into the header comment: crawlers read `robots.txt` **only** from
/// the host root (`/robots.txt`), so on a project-subpath deploy this file lands
/// at `/<sub>/robots.txt` and is ignored. It's correct-and-honoured for root
/// deploys and harmless (just unread) on a subpath.
fn robots_txt(base: &str) -> String {
    let bots = [
        "GPTBot",
        "OAI-SearchBot",
        "ChatGPT-User",
        "ClaudeBot",
        "Claude-SearchBot",
        "PerplexityBot",
        "CCBot",
        "Google-Extended",
    ];
    let mut out = String::from(
        "# KD Help Book — AI-facing documentation export.\n\
         # Crawlers read robots.txt only from the host root (/robots.txt); on a\n\
         # project-subpath deploy this copy is ignored — the sitemap and the\n\
         # relative <link> hooks in index.html carry discovery there.\n\n",
    );
    for bot in bots {
        out.push_str(&format!("User-agent: {bot}\nAllow: /\n\n"));
    }
    out.push_str("User-agent: *\nAllow: /\n\n");
    out.push_str(&format!("Sitemap: {base}sitemap.xml\n"));
    out
}

/// Add or replace docsets in an already-built distribution, updating its manifest.
pub fn patch(
    dist: &Path,
    docsets: &[PathBuf],
    compact: bool,
    stream: &Option<Vec<PathBuf>>,
) -> Result<()> {
    let manifest_path = dist.join("docsets.json");
    let mut manifest: Manifest = if manifest_path.exists() {
        serde_json::from_str(&fs::read_to_string(&manifest_path)?)
            .with_context(|| format!("parsing {}", manifest_path.display()))?
    } else {
        Manifest::default()
    };

    let docsets_dir = dist.join("docsets");
    fs::create_dir_all(&docsets_dir)?;
    let stream = stream_flags(stream, docsets)?;
    for (docset, stream) in docsets.iter().zip(stream) {
        let entry = add_docset(docset, &docsets_dir, compact, stream)?;
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

/// Resolve `--stream` against the docset list: absent → none, bare → every
/// docset, with values → only those (each must name a `--docset`, by full path
/// or by file name).
fn stream_flags(stream: &Option<Vec<PathBuf>>, docsets: &[PathBuf]) -> Result<Vec<bool>> {
    let Some(list) = stream else {
        return Ok(vec![false; docsets.len()]);
    };
    if list.is_empty() {
        return Ok(vec![true; docsets.len()]);
    }
    let matches = |sel: &PathBuf, khb: &PathBuf| sel == khb || sel.file_name() == khb.file_name();
    for sel in list {
        if !docsets.iter().any(|d| matches(sel, d)) {
            bail!("--stream {}: not among the --docset paths", sel.display());
        }
    }
    Ok(docsets
        .iter()
        .map(|d| list.iter().any(|sel| matches(sel, d)))
        .collect())
}

/// Copy a docset into `docsets/` (optionally gzip'd to `<name>.gz`) and return its
/// manifest entry, with metadata read from the docset itself.
fn add_docset(
    khb: &Path,
    docsets_dir: &Path,
    compact: bool,
    stream: bool,
) -> Result<ManifestEntry> {
    // Streaming reads raw SQLite pages by byte range, so a streamed docset (and
    // its packs) ships uncompressed even under `--mode compact`.
    let compact = compact && !stream;
    let ds = Docset::open(khb).with_context(|| format!("opening {}", khb.display()))?;
    let id = ds.id()?;
    let title = ds.meta("title")?.unwrap_or_else(|| id.clone());
    let language = ds.language()?;
    let collection = ds.collection()?;
    let version = ds.meta("version")?.unwrap_or_default();
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

    // Hash the *shipped* bytes (what the viewer actually fetches: the gzip'd blob
    // when compact, else the plain `.khb`) so the cache key tracks the transferred
    // content exactly.
    let (file, shipped) = if compact {
        let gz = gzip(&fs::read(&dest_khb)?)?;
        let gz_name = format!("{name}.gz"); // foo.khb -> foo.khb.gz
        fs::write(docsets_dir.join(&gz_name), &gz)?;
        fs::remove_file(&dest_khb)?;
        (format!("docsets/{gz_name}"), gz)
    } else {
        (format!("docsets/{name}"), fs::read(&dest_khb)?)
    };

    Ok(ManifestEntry {
        file,
        id,
        title,
        language,
        collection,
        version,
        attachments,
        streaming: stream,
        hash: content_hash(&shipped),
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

/// A short content hash (FNV-1a, 64-bit, as 16 hex digits) of a shipped file.
/// Not cryptographic — it only needs to change when the bytes change, giving each
/// build of a file a stable cache key for `docsets.json`. Fully specified (unlike
/// `DefaultHasher`), so the same bytes hash identically across platforms and
/// toolchains: an unchanged docset keeps its key — and the viewer's cache — deploy
/// to deploy, and only a real content change re-keys it.
fn content_hash(bytes: &[u8]) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325; // FNV offset basis
    for &b in bytes {
        h ^= u64::from(b);
        h = h.wrapping_mul(0x0000_0100_0000_01b3); // FNV prime
    }
    format!("{h:016x}")
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_hash_is_stable_and_content_sensitive() {
        // Fixed vectors pin the algorithm — a regression here silently re-keys
        // every docset URL (mass cache-bust), so the constants must not drift.
        assert_eq!(content_hash(b""), "cbf29ce484222325");
        assert_eq!(content_hash(b"a"), "af63dc4c8601ec8c");
        // Same bytes → same hash; a one-byte change → a different hash.
        assert_eq!(
            content_hash(b"SQLite format 3"),
            content_hash(b"SQLite format 3")
        );
        assert_ne!(content_hash(b"khb-v1"), content_hash(b"khb-v2"));
        assert_eq!(content_hash(b"khb").len(), 16); // always 16 hex digits
    }

    #[test]
    fn normalize_base_forces_one_trailing_slash() {
        assert_eq!(normalize_base("https://x.io"), "https://x.io/");
        assert_eq!(normalize_base("https://x.io/"), "https://x.io/");
        assert_eq!(normalize_base("https://x.io/docs"), "https://x.io/docs/");
        assert_eq!(normalize_base("https://x.io/docs///"), "https://x.io/docs/");
    }

    #[test]
    fn sitemap_lists_absolute_urls_under_a_subpath_base() {
        let base = normalize_base("https://acme.github.io/proj");
        let paths = [
            String::new(),
            "llms.txt".to_string(),
            "md/book/index.md".to_string(),
        ];
        let xml = sitemap_xml(&base, &paths);
        assert!(xml.starts_with("<?xml"));
        assert!(xml.contains("<loc>https://acme.github.io/proj/</loc>"));
        assert!(xml.contains("<loc>https://acme.github.io/proj/llms.txt</loc>"));
        assert!(xml.contains("<loc>https://acme.github.io/proj/md/book/index.md</loc>"));
        assert!(xml.trim_end().ends_with("</urlset>"));
    }

    #[test]
    fn sitemap_escapes_xml_specials_in_the_base() {
        let xml = sitemap_xml("https://x.io/a&b/", &["llms.txt".to_string()]);
        assert!(xml.contains("https://x.io/a&amp;b/llms.txt"));
        assert!(!xml.contains("a&b/llms")); // the raw ampersand must not survive
    }

    #[test]
    fn robots_allows_ai_bots_and_points_at_the_sitemap() {
        let robots = robots_txt("https://acme.github.io/proj/");
        assert!(robots.contains("User-agent: GPTBot\nAllow: /"));
        assert!(robots.contains("User-agent: ClaudeBot\nAllow: /"));
        assert!(robots.contains("User-agent: *\nAllow: /"));
        assert!(robots.contains("Sitemap: https://acme.github.io/proj/sitemap.xml"));
        // The subpath caveat must stay documented in the emitted file.
        assert!(robots.contains("host root"));
    }

    #[test]
    fn head_hooks_gate_the_sitemap_link_on_a_base_url() {
        let with = head_hooks(true);
        assert!(with.contains(r#"rel="llms-txt""#));
        assert!(with.contains(r#"rel="sitemap""#));
        let without = head_hooks(false);
        assert!(without.contains(r#"rel="llms-txt""#));
        assert!(!without.contains("sitemap")); // no sitemap.xml → no sitemap link
    }

    #[test]
    fn noscript_block_lists_sitemap_only_with_a_base_url() {
        let with = noscript_block(true);
        assert!(with.starts_with("<noscript>"));
        assert!(with.contains("llms.txt") && with.contains("llms-full.txt"));
        assert!(with.contains(r#"href="sitemap.xml""#));
        let without = noscript_block(false);
        assert!(without.contains("llms.txt") && without.contains("llms-full.txt"));
        assert!(!without.contains("sitemap.xml"));
    }

    #[test]
    fn inject_swaps_markers_and_strip_removes_them() {
        let dir = std::env::temp_dir().join(format!("khb-inject-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let html = format!("<head>{LLMS_HEAD_MARKER}</head><body>{LLMS_BODY_MARKER}</body>");

        // Inject with a base URL: both hooks land, no marker survives.
        fs::write(dir.join("index.html"), &html).unwrap();
        inject_llms_hooks(&dir, true).unwrap();
        let injected = fs::read_to_string(dir.join("index.html")).unwrap();
        assert!(!injected.contains(LLMS_HEAD_MARKER) && !injected.contains(LLMS_BODY_MARKER));
        assert!(injected.contains(r#"rel="llms-txt""#));
        assert!(injected.contains(r#"rel="sitemap""#));
        assert!(injected.contains("<noscript>"));

        // Strip leaves neither the markers nor any hooks.
        fs::write(dir.join("index.html"), &html).unwrap();
        strip_llms_markers(&dir).unwrap();
        let stripped = fs::read_to_string(dir.join("index.html")).unwrap();
        assert!(!stripped.contains(LLMS_HEAD_MARKER) && !stripped.contains(LLMS_BODY_MARKER));
        assert!(!stripped.contains("llms-txt") && !stripped.contains("noscript"));

        fs::remove_dir_all(&dir).ok();
    }
}
