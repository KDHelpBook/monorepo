# KD Help Book documentation

Reference for the KD Help Book format and tooling.

- **[format.md](format.md)** — the `.khb` / `.khba` file formats (and the
  `.gz` compression suffix), the SQLite schema, and asset attachments.
- **[compiler.md](compiler.md)** — the `khb` CLI: authoring sources and the
  `compile` / `pack` / `patch` / `inspect` commands.
- **[collections.md](collections.md)** — how the viewer merges multiple docsets,
  language grouping, and distribution profiles.
- **[streaming.md](streaming.md)** — the implemented HTTP-Range streaming and
  online/hybrid modes.
- **[desktop.md](desktop.md)** — the proposed future Tauri integration.

The compiled documentation collection contains separate Authoring, Publishing,
Registry, and Internals docsets under `docs/*/docset.toml`.

For the running demo content itself, open the viewer — the bundled docset
documents KD Help Book from a reader's point of view. This folder is the developer-facing
specification.
