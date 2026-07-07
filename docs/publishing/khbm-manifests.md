---
title: .khbm manifests
keywords: [khbm, manifest, import, remote docsets, attachments, relative URLs]
categories: [publishing, hosting]
related: [distribution, hosting, khb-internals:manifest-schemas]
---

# .khbm manifests

A **`.khbm`** is a small JSON file naming several remote docsets, so a reader can
add a whole product in one step — *Manage docsets → Import manifest…* in the
viewer — instead of pasting URLs one by one. Import needs a build with external
sources enabled — a [locked distribution](pack-profiles) has no *Manage docsets*
page.

## Format

```json [books.khbm]
{
  "khbm": 1,
  "title": "My Product Docs",
  "docsets": [
    { "url": "en.khb", "attachments": ["en.khba"] },
    { "url": "https://cdn.example/pl.khb.gz" }
  ]
}
```

| Field | Meaning |
|-------|---------|
| `khbm` | format marker, required (currently `1`) |
| `title` | optional display name for the import |
| `docsets[].url` | the `.khb` to add (plain or `.gz`) |
| `docsets[].attachments` | optional `.khba` pack URLs for that docset |

## Resolution rules

Every `url` and `attachments` entry is resolved **relative to the manifest's own
URL**. That's the point: publish `books.khbm` in the same directory as the
`.khb`/`.khba` files and reference them with bare relative paths — move or mirror
the directory and the manifest keeps working. Absolute URLs are allowed too and
pass through untouched. Relative resolution also lets a `.khbm` act as a disk
entry point for the future desktop (Tauri) app, reading its books straight from a
folder.

This is the key difference from `docsets.json`, whose paths are relative to a
**packed dist root** and which carries per-book metadata; a `.khbm` is authored
for *import* and stays deliberately minimal. (Formal schemas for both:
[Internals: manifest schemas](khb-internals:manifest-schemas).)

## What it doesn't say

A `.khbm` describes **what** the docsets are, not **how** to fetch them: there is
no `streaming` field. Whether an imported book streams page-by-page or fetches
whole is the reader's auto-negotiated choice (host `Range` support, file size).

> [!NOTE]
> The docsets a `.khbm` points at are fetched by the reader's **browser**, so a
> manifest hosted on another origin needs CORS on the files it names — see
> [Hosting](hosting). Parsing is forgiving: an entry without a usable `url` is
> skipped; a missing `khbm` marker or a non-array `docsets` rejects the file.
