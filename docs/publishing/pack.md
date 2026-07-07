---
title: pack — build a distribution
keywords: [pack, distribution, flags, viewer, docset, publish, CLI]
categories: [packing]
related: [getting-published, patch, distribution]
---

# pack — build a distribution

`khb pack` assembles a **publishable static distribution**: it copies a built
viewer, bundles docsets into `docsets/`, and writes `docsets.json` (metadata read
from each docset — nothing to declare by hand) and `config.json`. For each
`foo.khb` it also picks up any sibling attachment packs (`foo.khba`,
`foo.<tag>.khba`), records them in the docset's `attachments` array, and rewrites
the book's asset-routing index to cover exactly the packs being shipped.

```bash
khb pack --viewer viewer-ts/dist \
         --docset docs.khb --docset extras.khb \
         --profile reader \
         -o publish/
```

`pack` starts from a clean slate: a stale `docsets.json`, `config.json`, or
`docsets/` left in the output (for example by a dev build) is removed and
rewritten — the manifest describes exactly what you packed, nothing more. To
update an existing distribution without re-packing everything, use
[patch](patch).

## Flags

| Flag | Meaning |
|------|---------|
| `--viewer <dir>` | the built viewer to copy |
| `--docset <path>` | a docset to bundle (repeatable, at least one) |
| `-o <dir>` | output directory |
| `--mode khb\|compact` | how files ship: as-is, or gzipped to `<name>.gz` — see [Compression](pack-mode) |
| `--profile reader\|bundled` | sets the external-sources / PWA defaults — see [Profiles](pack-profiles) |
| `--lock` | lock the build: no docset management at all — see [Profiles](pack-profiles) |
| `--pwa` / `--no-pwa` | force the service worker on / off — see [Profiles](pack-profiles) |
| `--home <id\|search>` | the cold-start landing view — see [The landing page](pack-home) |
| `--llms` | also emit the AI-facing `llms.txt` export — see [AI export](pack-llms) |
| `--stream [<path>…]` | mark docset(s) for page-level streaming — see [Streaming](pack-stream) |
