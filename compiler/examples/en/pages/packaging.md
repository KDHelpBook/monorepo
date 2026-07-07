---
title: Packaging
keywords: [pack, packaging, publish, GitHub Pages, hosting, manifest]
categories: [distribution]
---
# Packaging

`khb pack` assembles a ready-to-host static distribution: it copies the viewer,
drops your docsets next to it, and writes a `docsets.json` manifest the viewer
loads on start.

```bash
khb pack --viewer viewer-ts/dist \
            --docset docs.khb \
            --profile reader \
            -o publish/
```

Two **profiles** shape the result:

| Profile | External sources | PWA | Use |
|---------|------------------|-----|-----|
| `reader` | on | on | general viewer; users can open other docsets |
| `bundled --lock` | off | off | a single product's docs, locked down |

`khb patch` adds or replaces docsets in an already-built distribution without
rebuilding the viewer. Host the output on any static host, such as GitHub Pages.
