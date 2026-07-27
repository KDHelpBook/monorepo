
# language (docset.toml)

The content language of the book. Content is authored as **one docset per language**;
translations are separate source folders sharing a [collection](docset-collection.md).

## Syntax

```toml
language = "en"
```

A regional tag works too — only the primary subtag matters (`en-US` → `en`).

## Default

`en` when omitted.

## Effect at compile time

The language selects the **full-text search tokenizer** baked into the docset:

| Language | Tokenizer | Meaning |
|----------|-----------|---------|
| `en` | `porter unicode61 remove_diacritics 2` | Porter stemming — *fox* matches *foxes* |
| anything else | `unicode61 remove_diacritics 2` | diacritic folding, no stemming |

See [Full-text search](khb-internals:full-text-search) for the machinery.

## In the viewer

Books group by language per collection, and the viewer shows **one language per
collection at a time**: the reader's per-collection override first, then the UI
language, then a fallback (English → browser language → first available). A
collection available in several languages gets a **Display language** selector under
*Manage docsets*.
