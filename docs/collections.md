# Collections, languages & profiles

## Collections — merging docsets (MS Help 2 style)

The viewer can load several docsets at once and **merge them into one** table of
contents, index, full-text search, and category facet — the modern equivalent of
MS Help 2 collections.

Page ids are namespaced as **`docsetId:localId`** so books never collide. A few
consequences:

- The keyword index and category facet union across books (a term or category can
  point at pages in several books).
- Search runs over every book and merges the ranked results.
- In-content `#localId` links resolve **within the same book**.
- The address bar reads `ms-help://docsetId/localId.htm`.

## Families — one product vs. many

To reconcile "merge my books" with "keep different products apart", each docset
declares a **family** via `collection` (an id; default = the docset id) and
`collection_title` (see [compiler.md](compiler.md)). The viewer groups loaded books
by family:

- **One family (or one book)** → its books merge into a single, seamless table of
  contents — no wrapper.
- **Several families** → each becomes a **collapsible top-level folder** (labelled by
  `collection_title`), so different products stay visually separate. The active
  family auto-expands.

So books of one product (Guide + API + Tutorials, all `collection = "myapp"`) read as
one book, while a second product loaded alongside gets its own folder.

## Scope — union with a product filter

The index and search **union across all products by default** (cross-product
discovery). To focus one product, a **"Filter by product:"** selector (Contents and
Index) and a **Product** scope on the Search page narrow to a single family without
losing the merged default. The category facet composes with it, and — like the
product scope — filtering by category **prunes the tree while keeping its folder
structure** rather than flattening it to a list.

## Where docsets come from

The viewer loads, per language:

1. **Bundled** docsets listed in `docsets.json` (written by `kdhelp pack`).
2. **Uploaded** docsets the user opened via *File → Open docset…*, persisted in
   the browser's IndexedDB and restored on the next visit.
3. **Remote** docsets added via *File → Open docset from URL…* — persisted as a URL
   and re-fetched each session (online / hybrid), the host permitting CORS. All three
   merge into one collection (see [streaming.md](streaming.md)).

`docsets.json`:

```json
{
  "docsets": [
    { "file": "docsets/docs.khb.gz", "id": "my-docs", "title": "My Docs",
      "language": "en", "attachments": ["docsets/docs.khba.gz"] }
  ]
}
```

A `file` (or an `attachments` entry) ending in `.gz` is gzip-compressed and gets
decompressed after fetch — so any file can be compressed independently. An optional
`attachments` array lists a docset's sidecar `.khba` packs (see
[the format spec](format.md#attachments-assets--khba)); the viewer opens them beside
the docset and routes assets through the `.khb`'s index.

## Languages

Each docset carries a `language`. The viewer groups docsets by language and shows
the set matching the active UI language; a toolbar selector switches language,
which swaps **both** the UI strings and the content. The choice is remembered
(localStorage) and otherwise inferred from `navigator.language`, falling back to
English. Content is therefore authored as **one docset per language** (with a
language-appropriate FTS tokenizer).

## Distribution profiles

`config.json` (written by `kdhelp pack`) drives two profiles:

| Profile | `externalSources` | `pwa` | Use |
|---------|-------------------|-------|-----|
| `reader` | `true` | `true` | general reader; users can open/upload docsets |
| `bundled --lock` | `false` | `false` | a single product's docs, locked down |

When `externalSources` is `false` the open/manage-docsets affordances are hidden.
When `pwa` is `true` a service worker is registered for best-effort offline use.
