---
title: Categories
keywords: [categories, facet, tags, filter]
categories: [authoring, reference]
---
# Categories

Categories are a **facet** — labels that cut across the table-of-contents tree. A
page can belong to several categories, and categories are independent of where
the page sits in the tree.

Declare them in `categories.yaml`:

```yaml
- id: basics
  title: Getting started
- id: reference
  title: Reference
```

…then tag pages in frontmatter with `categories: [basics, reference]`. The viewer
uses them to filter the tree and browse by topic, echoing the collection filters
of a classic desktop help viewer.
