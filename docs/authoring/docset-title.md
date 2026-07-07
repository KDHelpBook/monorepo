---
title: title (docset.toml)
keywords: [book title, display title, docset title, collection title, naming]
categories: [configuration]
related: [docset-toml, docset-collection, frontmatter-title]
---

# title (docset.toml)

The book's display title. **Required.**

## Syntax

```toml
title = "My Documentation"
```

## Fallback role

It doubles as the default for `collection_title` when the
[collection](docset-collection) declares none — so a single-book product needs no
extra naming.

## Example

```toml
title = "Authoring KD Help Books"
```

## In the viewer

The title names the book in **Manage docsets** and **Help → About** (alongside its
language and version), and it's the title recorded in a published site's
`docsets.json`. What labels the top-level folder in the table of contents is the
*family's* `collection_title` — which, for a standalone book, is this title.
