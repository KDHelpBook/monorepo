# KD Help Book documentation

Reference for the KD Help Book format and tooling.

- **[format.md](format.md)** — the `.khb` / `.khbb` / `.khba` file formats (and the
  `.gz` compression suffix), the SQLite schema, and asset attachments.
- **[compiler.md](compiler.md)** — the `khb` CLI: authoring sources and the
  `compile` / `convert` / `pack` / `patch` commands.
- **[collections.md](collections.md)** — how the viewer merges multiple docsets,
  language grouping, and distribution profiles.
- **[streaming.md](streaming.md)** — planned architecture for HTTP-Range streaming
  and online/hybrid modes (the format is already streaming-ready).
- **[desktop.md](desktop.md)** — running the viewer as an offline Tauri app.

For the running demo content itself, open the viewer — the bundled docset
documents KD Help Book from a reader's point of view. This folder is the developer-facing
specification.
