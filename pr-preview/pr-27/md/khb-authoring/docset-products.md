
# products (docset.toml)

The products this book belongs to — a **filter facet**, independent of the
[collection](docset-collection.md) merge key, and **many-to-many**: one book can belong
to several products, and one product can span several families.

## Syntax

```toml
[[products]]
id = "my-product"
title = "My Product"
[[products]]
id = "suite"
title = "The Suite"
```

## Default

Omitted → the book is filed under a single product named after its `collection`, so
the product filter keeps working for books that never declare any.

## Example

A shared "Getting started" book that should surface under both products of a suite:

```toml
[[products]]
id = "editor"
title = "The Editor"
[[products]]
id = "server"
title = "The Server"
```

## In the viewer

The Index and Search **union across all products by default**. The **Filter by
product** selector (Contents and Index) and the **Product** scope on the Search page
narrow to the books tagged with one product — pruning the tree while keeping the
family folder structure. Because products are tags, one selection can reveal books
from several families; the [category facet](frontmatter-categories.md) composes with it.
