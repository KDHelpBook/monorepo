//! `kdhelp` — the command-line tool.
//!
//! Subcommands: `compile` (source → `.khb`/`.khbb`), `convert` (`.khb` ⇄ `.khbb`),
//! `pack` (assemble a publishable distribution) and `patch` (update one in place).

mod publish;

use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use kdhelp_core::{binary, build, render, source, Docset};

use crate::publish::{pack, patch, PackOptions};

#[derive(Parser)]
#[command(name = "kdhelp", version, about = "kdhelp docset compiler & publisher")]
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
    },
    /// Add or replace docsets in an already-built distribution.
    Patch {
        /// The distribution directory to update in place.
        dist: PathBuf,
        #[arg(long = "docset", required = true, num_args = 1..)]
        docsets: Vec<PathBuf>,
        #[arg(long, value_enum, default_value = "khb")]
        mode: PackMode,
    },
}

fn main() -> Result<()> {
    match Cli::parse().command {
        Command::Compile { src, out, format } => compile(&src, &out, format),
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
            })
        }
        Command::Patch {
            dist,
            docsets,
            mode,
        } => patch(&dist, &docsets, mode == PackMode::Compact),
    }
}

fn compile(src: &Path, out: &Path, format: Format) -> Result<()> {
    let docset =
        source::load_dir(src).with_context(|| format!("loading source {}", src.display()))?;
    let (id, language, pages) = (
        docset.id.clone(),
        docset.language.clone(),
        docset.pages.len(),
    );
    let rendered = render::render(&docset);
    match format {
        Format::Khb => build::build_khb(&rendered, out)
            .with_context(|| format!("writing {}", out.display()))?,
        Format::Khbb => {
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
