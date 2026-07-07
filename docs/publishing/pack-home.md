---
title: The landing page (--home)
keywords: [home, landing, cold start, search, deep link, config.json]
categories: [packing]
related: [pack, pack-profiles]
---

# The landing page (--home)

`--home` sets what a visitor sees on a **cold start** — a first visit, or any
visit that doesn't deep-link to a specific page.

## Syntax

```bash
khb pack … --home my-docs:index        # a page, by full id
khb pack … --home search               # the Search page, explicitly
```

The value is either:

| Value | Landing |
|-------|---------|
| `docsetId:localId` | that page, opened with the table of contents revealed to it |
| `search` | the Search page |

Omit the flag and the viewer defaults to the **Search page** (search-first) — the
same as passing `search`, just left unwritten in `config.json`.

## What it writes

```json [config.json]
{
  "externalSources": false,
  "pwa": false,
  "home": "my-docs:index"
}
```

## Notes for KD Help Book

- The page id is the **namespaced** form (`docsetId:localId`) — the docset id from
  the book's `docset.toml` plus the page id, joined by `:`. A bare local id is not
  enough because a distribution can bundle several books.
- `--home` only affects cold starts. A shared deep link, a bookmark, or a restored
  session still opens exactly what it points at.
