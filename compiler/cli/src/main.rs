//! `khb` — the KD Help Book command-line tool.
//!
//! Subcommands: `compile` (source → `.khb`/`.khbb`), `convert` (`.khb` ⇄ `.khbb`),
//! `pack` (assemble a publishable distribution), `patch` (update one in place) and
//! `inspect` (print metadata for a local or HTTP-streamed docset).

mod http;
mod publish;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use khb_core::{binary, build, render, source, Docset, RangeReader};

use crate::http::HttpRangeReader;
use crate::publish::{pack, patch, PackOptions};

#[derive(Parser)]
#[command(
    name = "khb",
    version,
    about = "KD Help Book — docset compiler & publisher"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Copy, Clone, ValueEnum)]
enum Format {
    /// SQLite docset with a prebuilt full-text index.
    Khb,
    /// Minimal binary (no indexes); rebuilt into a `.khb` by the viewer.
    Khbb,
}

#[derive(Copy, Clone, PartialEq, ValueEnum)]
enum AssetsMode {
    /// Store attachments inside the `.khb`.
    Embed,
    /// Store attachments in a sibling `.khba` file (leaner `.khb`).
    Sidecar,
}

#[derive(Copy, Clone, PartialEq, ValueEnum)]
enum PackMode {
    /// Copy the `.khb` as-is.
    Khb,
    /// Gzip each docset to `.khbc` (smaller download).
    Compact,
}

#[derive(Copy, Clone, PartialEq, ValueEnum)]
enum Profile {
    /// General reader: external sources on, PWA on.
    Reader,
    /// Locked single-product build: external sources off, PWA off.
    Bundled,
}

#[derive(Subcommand)]
enum Command {
    /// Compile a source directory into a `.khb` (or `.khbb`) docset.
    Compile {
        /// Source directory (docset.toml, pages/*.md, optional toc.yaml / categories.yaml).
        src: PathBuf,
        /// Output path.
        #[arg(short, long)]
        out: PathBuf,
        /// Output format.
        #[arg(long, value_enum, default_value = "khb")]
        format: Format,
        /// Where attachments go: embedded in the `.khb`, or a sibling `.khba`.
        #[arg(long = "assets", value_enum, default_value = "embed")]
        assets: AssetsMode,
    },
    /// Convert between `.khb` and `.khbb` (direction inferred from file extensions).
    Convert {
        input: PathBuf,
        #[arg(short, long)]
        out: PathBuf,
    },
    /// Assemble a publishable distribution: viewer + docsets + manifest + config.
    Pack {
        /// Built viewer directory (e.g. `viewer-ts/dist`).
        #[arg(long)]
        viewer: PathBuf,
        /// Docset(s) to bundle. Repeatable.
        #[arg(long = "docset", required = true, num_args = 1..)]
        docsets: Vec<PathBuf>,
        /// Output directory.
        #[arg(short, long)]
        out: PathBuf,
        /// How docsets are shipped.
        #[arg(long, value_enum, default_value = "khb")]
        mode: PackMode,
        /// Distribution profile (sets external-sources / PWA defaults).
        #[arg(long, value_enum, default_value = "reader")]
        profile: Profile,
        /// Disable opening/uploading other docsets.
        #[arg(long)]
        lock: bool,
        /// Force the PWA service worker on.
        #[arg(long)]
        pwa: bool,
        /// Force the PWA service worker off.
        #[arg(long = "no-pwa")]
        no_pwa: bool,
        /// Landing view on a cold start: a page id (`docsetId:localId`) or
        /// `search`. Omitted → the viewer opens the Search page.
        #[arg(long)]
        home: Option<String>,
        /// Also emit an AI-facing export: `llms.txt` (link index), `llms-full.txt`
        /// (all pages inline), and per-page Markdown under `md/`.
        #[arg(long)]
        llms: bool,
        /// Absolute base URL of the deploy, with a trailing slash — e.g.
        /// `https://acme.github.io/` (root) or `https://acme.github.io/docs/`
        /// (project subpath). Only meaningful with `--llms`: it lets the export
        /// also write `sitemap.xml` (absolute `<loc>`s) and `robots.txt`
        /// (advertising the sitemap). Omitted → those two are skipped; the
        /// relative in-page discovery hooks still work.
        #[arg(long = "base-url")]
        base_url: Option<String>,
        /// Mark docset(s) for page-level streaming: the viewer opens them over
        /// HTTP `Range` instead of downloading the whole file (worth it for big
        /// books; needs a Range-capable host, else the viewer falls back). Bare
        /// `--stream` marks every docset; `--stream <path>` marks only that one
        /// (repeatable). Streamed files stay uncompressed even in compact mode.
        #[arg(long, num_args = 0.., value_name = "DOCSET")]
        stream: Option<Vec<PathBuf>>,
    },
    /// Add or replace docsets in an already-built distribution.
    Patch {
        /// The distribution directory to update in place.
        dist: PathBuf,
        #[arg(long = "docset", required = true, num_args = 1..)]
        docsets: Vec<PathBuf>,
        #[arg(long, value_enum, default_value = "khb")]
        mode: PackMode,
        /// Mark docset(s) for page-level streaming (see `pack --stream`).
        #[arg(long, num_args = 0.., value_name = "DOCSET")]
        stream: Option<Vec<PathBuf>>,
    },
    /// Print a docset's metadata. `src` is a local `.khb` path or an `http(s)://`
    /// URL — a remote docset is **streamed** over `Range` (only the pages read).
    Inspect { src: String },
}

/// Rust ignores SIGPIPE by default, so `khb inspect … | head` panics with
/// "failed printing to stdout: Broken pipe" once the pipe closes. Restore the
/// default disposition (die quietly, like every other CLI) before any output.
#[cfg(unix)]
fn reset_sigpipe() {
    unsafe {
        libc::signal(libc::SIGPIPE, libc::SIG_DFL);
    }
}
#[cfg(not(unix))]
fn reset_sigpipe() {}

fn main() -> Result<()> {
    reset_sigpipe();
    match Cli::parse().command {
        Command::Compile {
            src,
            out,
            format,
            assets,
        } => compile(&src, &out, format, assets),
        Command::Convert { input, out } => convert(&input, &out),
        Command::Pack {
            viewer,
            docsets,
            out,
            mode,
            profile,
            lock,
            pwa,
            no_pwa,
            home,
            llms,
            base_url,
            stream,
        } => {
            let mut external_sources = profile == Profile::Reader;
            if lock {
                external_sources = false;
            }
            let mut wants_pwa = profile == Profile::Reader;
            if pwa {
                wants_pwa = true;
            }
            if no_pwa {
                wants_pwa = false;
            }
            pack(&PackOptions {
                viewer,
                docsets,
                out,
                compact: mode == PackMode::Compact,
                external_sources,
                pwa: wants_pwa,
                home,
                llms,
                base_url,
                stream,
            })
        }
        Command::Patch {
            dist,
            docsets,
            mode,
            stream,
        } => patch(&dist, &docsets, mode == PackMode::Compact, &stream),
        Command::Inspect { src } => inspect(&src),
    }
}

fn inspect(src: &str) -> Result<()> {
    let is_url = src.starts_with("http://") || src.starts_with("https://");
    let reader = if is_url {
        Some(Arc::new(HttpRangeReader::open(src)?))
    } else {
        None
    };
    let ds = match &reader {
        Some(r) => Docset::open_reader(r.clone())?,
        None => Docset::open(Path::new(src))?,
    };

    println!("id:         {}", ds.id()?);
    println!("title:      {}", ds.meta("title")?.unwrap_or_default());
    println!("version:    {}", ds.meta("version")?.unwrap_or_default());
    println!("language:   {}", ds.language()?);
    println!(
        "collection: {} ({})",
        ds.collection()?,
        ds.collection_title()?
    );
    let toc = ds.toc_tree()?;
    println!(
        "toc:        {} entries ({} top-level)",
        ds.toc()?.len(),
        toc.len()
    );
    println!("categories: {}", ds.categories()?.len());
    println!("keywords:   {}", ds.keywords()?.len());
    for node in toc.iter().take(8) {
        println!("  - {}", node.title);
    }
    if toc.len() > 8 {
        println!("  … ({} top-level)", toc.len());
    }
    if let Some(r) = reader {
        println!(
            "streamed {} of {} bytes over HTTP ({}%)",
            r.bytes_read(),
            r.size(),
            r.bytes_read() * 100 / r.size().max(1)
        );
    }
    Ok(())
}

fn compile(src: &Path, out: &Path, format: Format, assets: AssetsMode) -> Result<()> {
    let docset =
        source::load_dir(src).with_context(|| format!("loading source {}", src.display()))?;
    let (id, language, pages) = (
        docset.id.clone(),
        docset.language.clone(),
        docset.pages.len(),
    );
    let mut rendered =
        render::render(&docset).with_context(|| format!("rendering {}", src.display()))?;
    match format {
        Format::Khb => {
            if assets == AssetsMode::Sidecar && !rendered.assets.is_empty() {
                // Peel attachments out of the .khb and into a sibling .khba, then
                // point the .khb's routing index at that pack.
                let khba = out.with_extension("khba");
                let sidecar = std::mem::take(&mut rendered.assets);
                build::build_khb(&rendered, out)
                    .with_context(|| format!("writing {}", out.display()))?;
                build::build_khba(&id, &sidecar, &khba)
                    .with_context(|| format!("writing {}", khba.display()))?;
                let pack = build::khba_pack_id(&khba);
                let paths = sidecar.iter().map(|a| a.path.clone()).collect();
                build::rebuild_asset_index(out, &[(pack, paths)])
                    .with_context(|| format!("indexing assets in {}", out.display()))?;
                println!("  + {} attachment(s) -> {}", sidecar.len(), khba.display());
            } else {
                build::build_khb(&rendered, out)
                    .with_context(|| format!("writing {}", out.display()))?;
            }
        }
        Format::Khbb => {
            if assets == AssetsMode::Sidecar {
                bail!("--assets sidecar is only valid for --format khb (khbb is a single file)");
            }
            let bytes = binary::to_khbb(&rendered)?;
            std::fs::write(out, bytes).with_context(|| format!("writing {}", out.display()))?;
        }
    }
    println!(
        "compiled {id} ({pages} pages, language {language}) -> {}",
        out.display()
    );
    Ok(())
}

fn convert(input: &Path, out: &Path) -> Result<()> {
    match (has_ext(input, "khbb"), has_ext(out, "khbb")) {
        (true, false) => {
            let bytes =
                std::fs::read(input).with_context(|| format!("reading {}", input.display()))?;
            build::build_khb(&binary::from_khbb(&bytes)?, out)?;
        }
        (false, true) => {
            let rendered = Docset::open(input)?.to_rendered()?;
            std::fs::write(out, binary::to_khbb(&rendered)?)
                .with_context(|| format!("writing {}", out.display()))?;
        }
        _ => bail!(
            "convert needs one .khb and one .khbb path (got {} -> {})",
            input.display(),
            out.display()
        ),
    }
    println!("converted {} -> {}", input.display(), out.display());
    Ok(())
}

fn has_ext(path: &Path, ext: &str) -> bool {
    path.extension()
        .is_some_and(|e| e.eq_ignore_ascii_case(ext))
}
