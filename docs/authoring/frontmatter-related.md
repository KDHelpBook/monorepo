---
title: related (frontmatter)
keywords: [related, see also, footer, cross-book, curated links, references]
categories: [configuration]
related: [frontmatter, page-links, frontmatter-id]
---

# related (frontmatter)

Curated onward reading: the page ids rendered as the page's **See also** footer.

## Syntax

```yaml
related: [writing-pages, table-of-contents, other-book:overview]
```

Each entry is an in-book page [id](frontmatter-id), or a cross-book
`docsetId:pageId` — the same two forms as [page links](page-links).

## Default

None — the page has no See also footer.

## Validation

In-book ids are checked at [compile time](compiling); a typo fails the build.
Cross-book ids are stored as-is (the other book compiles separately).

## In the viewer

The footer lists the entries **in the order written**, each labelled with the target
page's title. A cross-book entry whose book isn't loaded is **hidden**, so a book read
on its own shows no dead links.

> [!TIP]
> Keep it to 2–4 genuinely next-step pages. `related` is a recommendation shelf, not
> a sitemap — the TOC already does that job.
