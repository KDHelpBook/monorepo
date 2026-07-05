//! `kdhelp` — the command-line tool.
//!
//! Subcommands: `compile` (source → `.khb`/`.khbb`) and `convert` (`.khb` ⇄ `.khbb`).
//! `pack` / `patch` land in a later phase.

use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand, ValueEnum};
use kdhelp_core::{binary, build, render, source, Docset};

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
        /// Input `.khb` or `.khbb`.
        input: PathBuf,
        /// Output `.khbb` or `.khb`.
        #[arg(short, long)]
        out: PathBuf,
    },
}

fn main() -> Result<()> {
    match Cli::parse().command {
        Command::Compile { src, out, format } => compile(&src, &out, format),
        Command::Convert { input, out } => convert(&input, &out),
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
            let rendered = binary::from_khbb(&bytes)?;
            build::build_khb(&rendered, out)?;
        }
        (false, true) => {
            let rendered = Docset::open(input)?.to_rendered()?;
            let bytes = binary::to_khbb(&rendered)?;
            std::fs::write(out, bytes).with_context(|| format!("writing {}", out.display()))?;
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
