---
title: Anatomy of a distribution
keywords: [docsets.json, config.json, manifest, distribution, attachments, fields]
categories: [publishing]
related: [pack, hosting, khb-internals:manifest-schemas]
---

# Anatomy of a distribution

A packed distribution is four things: the viewer, a `docsets/` folder, and two
JSON files the viewer reads on start. This page explains what each field means
and how the viewer consumes it; the formal field-by-field schema lives in
[Internals: manifest schemas](khb-internals:manifest-schemas).

```text
publish/
├── index.html, assets/…      # the viewer, copied verbatim
├── docsets/
│   ├── docs.khb.gz           # a bundled book (compact mode)
│   ├── docs.khba.gz          # …and its attachment pack
│   └── big-book.khb          # a streamed book (always uncompressed)
├── docsets.json              # the manifest
├── config.json               # the profile
└── llms.txt, llms-full.txt, md/…   # only with --llms
```

## docsets.json

One entry per bundled book, all metadata read from the docset itself at pack
time:

```json [docsets.json]
{
  "docsets": [
    { "file": "docsets/docs.khb.gz", "id": "my-docs", "title": "My Docs",
      "language": "en", "collection": "my-product", "version": "1.2.0",
      "attachments": ["docsets/docs.khba.gz"] },
    { "file": "docsets/big-book.khb", "id": "big-book", "title": "Big Book",
      "language": "en", "collection": "big-book", "streaming": true }
  ]
}
```

| Field | Meaning |
|-------|---------|
| `file` | path under the dist root. A trailing `.gz` means gzip-compressed; the viewer decompresses after fetch |
| `id` | the docset id — namespaces every page id (`docsetId:localId`) |
| `title` | display title |
| `language` | the book's content language |
| `collection` | the product/family key: books sharing it are one product across languages and versions, so the viewer picks one language variant per collection |
| `version` | the content version, surfaced read-only and driving the [version switcher](versioning); omitted when unset |
| `attachments` | sidecar `.khba` packs (zero or more, each optionally `.gz`); the viewer opens them beside the docset |
| `streaming` | opt-in page-level [streaming](pack-stream): open over HTTP `Range`, falling back to a whole fetch; omitted when `false` |

## config.json

The distribution profile:

```json [config.json]
{
  "externalSources": false,
  "pwa": false,
  "home": "my-docs:index"
}
```

| Field | Meaning |
|-------|---------|
| `externalSources` | `false` hides all docset management (open / URL / manage) and skips persisted uploads and remotes — see [Profiles](pack-profiles) |
| `pwa` | register the service worker for best-effort offline use |
| `home` | cold-start landing: a page id or `"search"`; omitted → the Search page — see [The landing page](pack-home) |

## How the viewer consumes them

On start the viewer fetches `config.json`, then `docsets.json`, then loads every
listed book (inflating `.gz` files, opening `attachments` alongside, streaming
the `streaming: true` ones). Bundled books merge with whatever the visitor has
uploaded or added by URL — unless `externalSources` is off — into one table of
contents, index, and search.

> [!NOTE]
> You never edit these files by hand in normal use: [pack](pack) writes both, and
> [patch](patch) updates `docsets.json` surgically. The schemas matter when you're
> generating a distribution some other way.
