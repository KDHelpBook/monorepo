
# collection (docset.toml)

The **merge/family key**: books sharing a `collection` belong to one product and
merge into one table of contents.

## Syntax

```toml
collection = "my-product"       # the family key
collection_title = "My Product" # the family's display title
```

## Default

`collection` defaults to the docset [id](docset-id.md), `collection_title` to the
docset [title](docset-title.md) — a standalone book is its own one-book family with no
extra configuration.

## Example

A product split across three books that should read as one:

```toml
# in guide/, api/ and tutorials/ docset.toml alike:
collection = "myapp"
collection_title = "MyApp Documentation"
```

## In the viewer

- Books of **one family merge seamlessly** — one table of contents, no wrapper.
- When **several families** are loaded, each becomes a collapsible **top-level
  folder** labelled with its `collection_title`, keeping products visually apart.
- The collection is also how **editions pair up**: language variants and
  [versions](docset-version.md) of one book share a collection, driving the display
  language and version switchers.
