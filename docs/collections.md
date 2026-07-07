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

## Products — the filter facet (many-to-many)

`collection` merges books; **`products`** filters them, and the two are independent.
A docset lists the `products` it belongs to (id + title — see
[compiler.md](compiler.md)); this is **many-to-many**, so a book can appear under
several products, and a product can span several families. A docset with no explicit
`products` defaults to one named after its `collection`, so the scope keeps working
for un-migrated books.

## Scope — union with a product filter

The index and search **union across all products by default** (cross-product
discovery). To focus one product, a **"Filter by product:"** selector (Contents and
Index) and a **Product** scope on the Search page narrow to books tagged with that
product — **pruning** the tree to the matching books while keeping the family folder
structure (not flattening it), and never losing the merged default. Because products
are a tag, one selection can reveal books from several families. The category facet
composes with it the same way.

## Where docsets come from

The viewer loads, per language:

1. **Bundled** docsets listed in `docsets.json` (written by `kdhelp pack`).
2. **Uploaded** docsets the user opened via *File → Open docset…*, persisted in
   the browser's IndexedDB and restored on the next visit.
3. **Remote** docsets added via *File → Open docset from URL…* — persisted as a URL
   and re-fetched each session (online / hybrid), the host permitting CORS. All three
   merge into one collection (see [streaming.md](streaming.md)).

All of these are managed from one place — *File → Manage docsets…* opens the
**Manage docsets** page (an in-app tab): every loaded book, grouped by product, with
its source (bundled / uploaded / remote), language + version selectors (switched
live), and attachment packs. From there you can open a docset, add one from a URL,
or **import a `.khbm` manifest**.

A **remote** prefers **streaming** (page-by-page over HTTP `Range`) but auto-falls
back to a whole fetch when the host has no Range support — so it works everywhere; a
whole-fetch docset can still pair with remote `.khba` packs.

If a loaded book references assets whose owning `.khba` pack wasn't shipped (the
`asset_index` routes them to a pack that isn't loaded), its edition shows a
**⚠ N missing assets** badge with an **Add pack…** action: give the URL of the
`.khba` and it's attached to that docset (persisted per docset id, applied on every
load) so the images resolve. This works for any source — a bundled or uploaded `.khb`
can be completed with a pack fetched from a URL.

### `.khbm` — a book manifest for one-step import

A `.khbm` is a small JSON file naming several remote docsets so a whole product
imports at once (via *Manage docsets → Import manifest…*). Unlike `docsets.json` (a
packed-dist descriptor), its `url`/`attachments` are resolved **relative to the
manifest's own URL**, so it can ship beside its files:

```json
{
  "khbm": 1,
  "title": "My Product Docs",
  "docsets": [
    { "url": "en.khb", "attachments": ["en.khba"] },
    { "url": "https://cdn.example/pl.khb.gz" }
  ]
}
```

It describes *what* the docsets are, not *how* to fetch them (streaming is the
reader's auto-negotiated choice). Relative resolution also lets a `.khbm` act as a
disk entry point for the future desktop (Tauri) app, reading its `.khb`/`.khba`
straight from disk.

`docsets.json`:

```json
{
  "docsets": [
    { "file": "docsets/docs.khb.gz", "id": "my-docs", "title": "My Docs",
      "language": "en", "collection": "my-product", "version": "1.2.0",
      "attachments": ["docsets/docs.khba.gz"] },
    { "file": "docsets/big-book.khb", "id": "big-book", "title": "Big Book",
      "language": "en", "streaming": true }
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

An optional `"streaming": true` (written by `kdhelp pack/patch --stream`) marks a
bundled docset for **page-level streaming**: the viewer opens it (and its packs)
over HTTP `Range` instead of downloading the whole file — worth it for big books,
and available even in a locked `bundled` build. It is a preference, not a promise:
if the host doesn't honour `Range` (or the streamed open fails), the viewer falls
back to the whole fetch. A streamed file must be served raw, so `streaming` is
ignored for `.gz` entries (see [streaming.md](streaming.md)).

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

The bundled **Sample SDK** demo ships as two versions (`sample-sdk-v1` /
`sample-sdk-v2`, sources in `compiler/examples/`) so the switcher is visible in the
reader: 2.0 shows by default and adds a *Migrating from 1.0* page that disappears
when you select 1.0.

## Distribution profiles

`config.json` (written by `kdhelp pack`) drives two profiles:

| Profile | `externalSources` | `pwa` | Use |
|---------|-------------------|-------|-----|
| `reader` | `true` | `true` | general reader; users can open/upload docsets |
| `bundled --lock` | `false` | `false` | a single product's docs, locked down |

When `externalSources` is `false` the open/manage-docsets affordances are hidden.
When `pwa` is `true` a service worker is registered for best-effort offline use.
