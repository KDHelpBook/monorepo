---
title: Page links
keywords: [page links, in-book, cross-book, page id, docset id, see also, navigation]
categories: [extensions]
related: [links, frontmatter-related, frontmatter-id, docset-id]
---

# Page links

Pages are linked by **id** — no file paths, no `.md` or `.htm` suffixes — so links
survive reorganizing the source folder and keep working when several books are loaded
together.

```md
In-book page:   [Writing pages](writing-pages)
Cross-book:     [SDK reference](sample-sdk:overview)
```

## In-book pages — a bare `page-id`

A bare target (no `#`, no scheme) is the **id of another page in the same book**. The
viewer navigates to it in the current tab. A page's id defaults to its file name —
see [id (frontmatter)](frontmatter-id).

```md
See [Writing pages](writing-pages) for the frontmatter fields.
```

## Cross-book links — `docsetId:pageId`

When several docsets are loaded together, link across them by prefixing the target
page's id with its book's [docset id](docset-id):

```md
See the [SDK overview](sample-sdk:overview).
```

The viewer **hides** a cross-book link whose book isn't loaded, so a partial
collection never shows dead ends.

## Compile-time validation

The compiler checks in-book ids where it can: every id in [toc.yaml](toc-yaml) and
every in-book entry in a page's `related` list must name an existing page, or the
build fails. Cross-book ids are stored as-is — the other book compiles separately —
and resolve (or hide) at view time.

## The See also footer

For curated onward reading, list page ids in the page's `related` frontmatter instead
of weaving links into prose — the viewer renders them as a **See also** footer, using
the same two id forms. See [related (frontmatter)](frontmatter-related).
