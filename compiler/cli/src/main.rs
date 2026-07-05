//! `kdhelp` — the command-line tool.
//!
//! Subcommands (implemented in Phase 1b): `compile`, `pack`, `patch`, `convert`.
//! This is the crate skeleton.

fn main() -> anyhow::Result<()> {
    println!("kdhelp {} ({})", env!("CARGO_PKG_VERSION"), kdhelp_core::generator());
    println!("subcommands: compile | pack | patch | convert (coming in Phase 1b)");
    Ok(())
}
