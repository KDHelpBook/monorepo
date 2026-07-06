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
      "language": "en", "collection": "my-product", "version": "1.2.0",
      "attachments": ["docsets/docs.khba.gz"] }
  ]
}
```

`collection` (the product/family key) and `version` come straight from the docset's
`meta` and drive the language selection and version display below.

A `file` (or an `attachments` entry) ending in `.gz` is gzip-compressed and gets
decompressed after fetch — so any file can be compressed independently. An optional
`attachments` array lists a docset's sidecar `.khba` packs (see
[the format spec](format.md#attachments-assets--khba)); the viewer opens them beside
the docset and routes assets through the `.khb`'s index.

## Languages

Each docset carries a `language`; the same product in several languages shares one
`collection`. A toolbar selector sets the **UI language** (chrome strings), remembered
in localStorage and otherwise inferred from `navigator.language`, falling back to
English. Content is authored as **one docset per language** (with a
language-appropriate FTS tokenizer).

Which language of each product is shown is decided **per collection**, so a book
present only in another language never vanishes on a language switch:

1. the reader's explicit **override** for that collection (see below), if that
   language exists; otherwise
2. the **UI language**, if the collection offers it; otherwise
3. a **fallback** — English, then `navigator.language`, then the collection's first
   available language.

Only one language per collection is shown (the same book is never merged twice into
the TOC). Under *File → Manage docsets…*, every collection available in more than one
language gets a **Display language** selector that pins it to a chosen language — even
one other than the UI language. The choice persists (localStorage) and applies on the
next load.

## Versions

Each docset's `meta.version` is surfaced read-only: in *Help → About* (every loaded
book with its language + version), in *Manage docsets…*, and as a tooltip on each
product folder in the table of contents.

When one product (`collection`) is loaded in **several versions** — separate docsets
sharing a collection but differing in `version` — the viewer shows only **one** at a
time: the **latest** by default (numeric-dotted comparison, so `1.10 > 1.2`). A
**Version** selector then appears (in the left panel when a single product is
versioned; per product under *Manage docsets…*) to pin an older one. The choice
persists and applies on reload — the resolver picks the version first, then the
language within it. So the same book never appears once per version in the merged
table of contents, and a re-fetched remote that bumps its version is announced via a
toast (see the update notice above).

## Distribution profiles

`config.json` (written by `kdhelp pack`) drives two profiles:

| Profile | `externalSources` | `pwa` | Use |
|---------|-------------------|-------|-----|
| `reader` | `true` | `true` | general reader; users can open/upload docsets |
| `bundled --lock` | `false` | `false` | a single product's docs, locked down |

When `externalSources` is `false` the open/manage-docsets affordances are hidden.
When `pwa` is `true` a service worker is registered for best-effort offline use.
