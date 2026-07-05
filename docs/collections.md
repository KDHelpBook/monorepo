# Collections, languages & profiles

## Collections — merging docsets (MS Help 2 style)

The viewer can load several docsets at once and **merge them into one** table of
contents, index, full-text search, and category facet — the modern equivalent of
MS Help 2 collections.

Page ids are namespaced as **`docsetId:localId`** so books never collide. A few
consequences:

- The table of contents concatenates each book's top-level nodes.
- The keyword index and category facet union across books (a term or category can
  point at pages in several books).
- Search runs over every book and merges the ranked results.
- In-content `#localId` links resolve **within the same book**.
- The address bar reads `ms-help://docsetId/localId.htm`.

## Where docsets come from

The viewer loads, per language:

1. **Bundled** docsets listed in `docsets.json` (written by `kdhelp pack`).
2. **Uploaded** docsets the user opened via *File → Open docset…*, persisted in
   the browser's IndexedDB and restored on the next visit.

`docsets.json`:

```json
{
  "docsets": [
    { "file": "docsets/docs.khb", "id": "my-docs", "title": "My Docs",
      "language": "en", "mode": "khb" }
  ]
}
```

`mode` is `khb` (plain) or `compact` (a gzip'd `.khbc`, decompressed in-browser).

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
