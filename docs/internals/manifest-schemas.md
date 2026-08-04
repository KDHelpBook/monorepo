---
title: Manifest schemas
keywords: [docsets.json, config.json, khbm, manifest, schema, JSON]
categories: [internals, format]
related: [streaming, khb-publishing:distribution, khb-publishing:khbm-manifests]
---

# Manifest schemas

Three small JSON documents describe books to the viewer: `docsets.json` and
`config.json` (both written into a packed distribution by `khb pack`) and `.khbm`
(an import manifest authored by hand). This page is the field-by-field schema —
what publishers do with them lives in
[Distribution anatomy](khb-publishing:distribution) and
[.khbm manifests](khb-publishing:khbm-manifests).

## `docsets.json` — the packed-dist manifest

Loaded by the viewer on start; lists the bundled docsets. All paths are relative
to the dist root.

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

| Field | Required | Meaning |
|-------|----------|---------|
| `file` | yes | path under the dist root; a trailing `.gz` means gzip-compressed, decompressed after fetch |
| `id` | yes | the docset id (`meta.docset_id`) — the namespace in `docsetId:pageId` |
| `title` | yes | display title |
| `language` | yes | content language; drives per-collection language selection |
| `collection` | no (default `""`) | product/family key (`meta.collection`); books sharing it are one product across languages/versions |
| `version` | no (omitted when empty) | content version (`meta.version`), surfaced in the viewer and its version switcher |
| `attachments` | no (omitted when empty) | sidecar `.khba` pack paths (each optionally `.gz`), opened alongside the docset |
| `streaming` | no (default `false`) | opt-in page-level streaming: open this docset (and its packs) over HTTP `Range`, falling back to a whole fetch when the host can't `Range` |
| `hash` | no | stable content identity used to version the URL and offline-cache entry; `khb pack` hashes the shipped bytes, while the registry uses the R2 ETag |
| `versions` | no (omitted when empty) | **older editions of this same book** — see below |

### `versions` — older editions (optional)

An entry describes the **current** edition of a book; `versions` lists the older
ones, which the viewer offers in its [version switcher](khb-publishing:versioning).
Every edition of a book shares its docset id and differs in `version`, so only one
is ever loaded at a time.

```json [docsets.json (fragment)]
{ "file": "docsets/docs-2.1.0.khb", "id": "my-docs", "title": "My Docs",
  "language": "en", "collection": "my-product", "version": "2.1.0",
  "versions": [
    { "version": "2.0.3", "file": "docsets/docs-2.0.3.khb", "title": "My Docs",
      "language": "en", "collection": "my-product", "hash": "8be4a7484bc6dc9b" }
  ] }
```

| Field | Required | Meaning |
|-------|----------|---------|
| `version` | yes | the edition's `meta.version`; must differ from the entry's and from its siblings' |
| `file` | yes | path to that edition's `.khb`, exactly like the entry's `file` |
| `title` | yes | the title **this** edition was published with — a book may have been retitled since |
| `language` | yes | that edition's content language |
| `collection` | yes | that edition's product family |
| `attachments` | no | that edition's sidecar packs |
| `hash` | no | that edition's content identity |
| `publishedAt` | no | ISO timestamp, informational (the registry records it; the viewer doesn't render it) |

The entry's `streaming` flag covers the whole book: an edition is streamed under
the same rule as the current one, and a `.gz` edition falls back to a whole fetch
on its own. Describing an edition costs nothing — the viewer negotiates transport
only for the edition it actually loads — so a long archive doesn't slow the start-up.

Besides `docsets`, the manifest may carry one optional top-level field:

| Field | Required | Meaning |
|-------|----------|---------|
| `folders` | no | a nested presentation tree grouping product families into TOC folders (below) |

> [!NOTE]
> `streaming` and `.gz` are mutually exclusive in practice: streamed files must be
> served raw, so the viewer ignores the flag on `.gz` entries (see
> [Streaming](streaming)).

### `folders` — nested TOC folders (optional)

Groups product **families** (`collection` ids) into arbitrarily nested folders
rendered above the family level in the Contents tree. Written by `khb pack
--folders <file.json>` (the file holds the bare array) and preserved verbatim by
`khb patch`.

```json [docsets.json (fragment)]
"folders": [
  { "id": "tools", "title": "Developer Tools", "titles": { "pl": "Narzędzia" },
    "children": [
      { "collection": "my-product" },
      { "id": "legacy", "title": "Legacy",
        "children": [ { "collection": "old-product" } ] }
    ] }
]
```

A child is either a **leaf ref** `{ "collection": "<id>" }` (places that family
here) or a **nested folder** of the same shape.

| Field | Required | Meaning |
|-------|----------|---------|
| `id` | yes | stable folder key — the viewer persists expansion state on it (`@shelf:<id>`), so renaming the title is safe, renaming the id resets its open/closed state |
| `title` | yes | default display title |
| `titles` | no | per-UI-language titles; the viewer picks `titles[uiLang]`, else `title` |
| `children` | no | leaf refs and/or nested folders |

Rules (enforced by the CLI; the viewer warns and ignores a broken tree rather
than failing to boot):

- a collection may be placed **once** in the whole tree, and folder `id`s must
  be unique — duplicates are a pack error;
- a ref to a collection that isn't among the packed docsets is only a
  **warning** (the same folders file may serve a registry hosting more books);
- a family the tree doesn't mention renders at the **root**, after the folders
  — so do uploaded and remote books, whose collections a shipped manifest can't
  know. A manifest without `folders` behaves exactly as before;
- folders whose families aren't loaded (and refs to absent collections) are
  dropped, never rendered empty.

## `config.json` — the distribution profile

Written next to `docsets.json`; drives the viewer's profile.

```json [config.json]
{
  "externalSources": true,
  "pwa": true,
  "home": "my-docs:getting-started",
  "prefetch": true
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `externalSources` | boolean | `true` (reader profile): users may open/upload/add docsets. `false` (`bundled --lock`): those affordances are hidden and remote sources are never used |
| `pwa` | boolean | `true` registers a service worker for best-effort offline use |
| `home` | string, optional | the landing view on a cold start: a page id (`docsetId:localId`) or the literal `"search"`. Omitted → the viewer defaults to the Search page |
| `prefetch` | boolean, optional | default the per-device “Keep books offline” toggle to on for streamed books |
| `prefetchLocked` | boolean, optional | hide and hard-disable offline prefetch, overriding any saved per-device choice |

## `.khbm` — the import manifest

A `.khbm` names several remote docsets so a whole product can be added in one step
(*Manage docsets → Import manifest…*). It is **not** `docsets.json`: a
`docsets.json` describes a packed dist with dist-root-relative paths, while a
`.khbm` is authored for import and its URLs resolve **relative to the manifest's
own URL** — so it can ship beside its `.khb`/`.khba` files and reference them with
plain relative paths.

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

| Field | Required | Meaning |
|-------|----------|---------|
| `khbm` | yes | format marker/version (`1`); its absence rejects the file |
| `title` | no | display name for the imported set |
| `docsets` | yes | array of entries |
| `docsets[].url` | yes | the `.khb` URL, resolved against the manifest URL |
| `docsets[].attachments` | no | `.khba` pack URLs, each resolved against the manifest URL |

Parsing is lenient about entries and strict about the envelope: a missing `khbm`
marker or a non-array `docsets` is an error, while an entry without a usable `url`
is silently skipped. Note there is deliberately **no** per-entry `streaming` field
— the manifest describes *what* the docsets are, not *how* to fetch them; whether
to stream is a reader/transport choice negotiated per docset. The reference
parser is `viewer-ts/src/data/khbm.ts`.
