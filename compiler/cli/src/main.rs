//! `kdhelp` — the command-line tool.
//!
//! Subcommands: `compile` (source → `.khb`). `pack` / `patch` / `convert` land in
//! later phases.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use kdhelp_core::{build, source};

#[derive(Parser)]
#[command(name = "kdhelp", version, about = "kdhelp docset compiler & publisher")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Compile a source directory into a `.khb` docset.
    Compile {
        /// Source directory (docset.toml, pages/*.md, optional toc.yaml / categories.yaml).
        src: PathBuf,
        /// Output `.khb` path.
        #[arg(short, long)]
        out: PathBuf,
    },
}

fn main() -> Result<()> {
    match Cli::parse().command {
        Command::Compile { src, out } => compile(&src, &out),
    }
}

fn compile(src: &Path, out: &Path) -> Result<()> {
    let docset =
        source::load_dir(src).with_context(|| format!("loading source {}", src.display()))?;
    let page_count = docset.pages.len();
    let (id, language) = (docset.id.clone(), docset.language.clone());
    build::build_khb(&docset, out).with_context(|| format!("writing {}", out.display()))?;
    println!(
        "compiled {id} ({page_count} pages, language {language}) -> {}",
        out.display()
    );
    Ok(())
}
