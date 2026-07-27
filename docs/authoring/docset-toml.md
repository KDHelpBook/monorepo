---
title: docset.toml
keywords: [docset.toml, manifest, metadata, book, configuration, TOML]
categories: [configuration]
related: [docset-id, frontmatter, toc-yaml, getting-started]
---

# docset.toml

The book manifest — the one required file besides the pages. It sits at the root of
the source folder and identifies the docset:

```toml [docset.toml]
id = "my-docs"
title = "My Documentation"
version = "0.1.0"
language = "en"                 # selects the search tokenizer
collection = "my-product"       # optional: merge/family key (default = id)
collection_title = "My Product" # optional: family display title (default = title)

# optional: products this book belongs to (a many-to-many filter facet)
[[products]]
id = "my-product"
title = "My Product"
[[products]]
id = "suite"
title = "The Suite"
```

One folder, one book, one language: the same product in other languages or versions
is a *separate* source folder whose manifest shares the `collection` (and, for
languages, the `version`).

## Fields

| Field | Required | Sets | Details |
|-------|----------|------|---------|
| `id` | yes | the docset id that namespaces every page | [id](docset-id) |
| `title` | yes | the book's display title | [title](docset-title) |
| `version` | no (default `0.1.0`) | the edition, and the version switcher | [version](docset-version) |
| `language` | no (default `en`) | the content language and search tokenizer | [language](docset-language) |
| `collection`, `collection_title` | no | the merge/family key | [collection](docset-collection) |
| `[[products]]` | no | the product filter facet | [products](docset-products) |
| `[extensions.<name>]` | no | external block transformers | [extensions](extensions) |

The manifest is stored in the compiled `.khb`'s metadata — `khb inspect my.khb`
prints it back (see [Compiling a book](compiling)).
