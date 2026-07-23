
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

> [!NOTE]
> `streaming` and `.gz` are mutually exclusive in practice: streamed files must be
> served raw, so the viewer ignores the flag on `.gz` entries (see
> [Streaming](streaming.md)).

## `config.json` — the distribution profile

Written next to `docsets.json`; drives the viewer's profile.

```json [config.json]
{
  "externalSources": true,
  "pwa": true,
  "home": "my-docs:getting-started"
}
```

| Field | Type | Meaning |
|-------|------|---------|
| `externalSources` | boolean | `true` (reader profile): users may open/upload/add docsets. `false` (`bundled --lock`): those affordances are hidden and remote sources are never used |
| `pwa` | boolean | `true` registers a service worker for best-effort offline use |
| `home` | string, optional | the landing view on a cold start: a page id (`docsetId:localId`) or the literal `"search"`. Omitted → the viewer defaults to the Search page |

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
