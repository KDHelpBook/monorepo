---
title: id (frontmatter)
keywords: [id, page id, identifier, slug, file name, stable links]
categories: [configuration]
related: [frontmatter, links, toc-nodes]
---

# id (frontmatter)

The page's stable identifier — the name every link uses: [links](links) in
other pages, [`related`](frontmatter-related) lists, and [toc.yaml](toc-yaml).

## Syntax

```yaml
id: writing-pages
```

## Default

The file name without `.md`, slugged: ASCII letters and digits are kept (lowercased),
every other character becomes `-` — `Writing Pages.md` → `writing-pages`. Set `id`
explicitly when the file name isn't the id you want to commit to, e.g. under numeric
prefix ordering (`01-intro.md` would otherwise become `01-intro` — see
[TOC ordering](toc-ordering)).

## Example

This book's own `README.md` starts with:

```md [README.md]
---
id: index
title: Authoring KD Help Books
---
```

so the intro page's id is `index`, not `readme`.

## In the viewer

Ids are namespaced per book — `docsetId:pageId` — so books never collide; the address
bar reads `khb://my-docs/writing-pages.htm`. An id is your public contract: changing
one on a published page breaks inbound cross-book links and readers' bookmarks.
