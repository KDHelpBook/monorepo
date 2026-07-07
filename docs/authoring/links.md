---
title: Links
keywords: [links, page id, cross-book, anchor, slug, external, autolink, see also]
categories: [markdown]
related: [headings, frontmatter-related, docset-id, images]
---

# Links

Standard Markdown `[label](target)` links — the target alone decides what happens.
Pages are linked by **id** (no file paths, no `.md` or `.htm` suffixes), so links
survive reorganizing the source folder and keep working when several books are
loaded together.

```md
In-page anchor: [Setup](#setup)
In-book page:   [Writing pages](writing-pages)
Cross-book:     [SDK reference](sample-sdk:overview)
External:       [Nuxt UI](https://ui.nuxt.com)
Autolink:       https://example.com
```

## In-page anchors — `#slug`

A `#slug` target scrolls to the **heading on the current page** whose id is `slug`.
Every heading gets an id automatically (the slug of its text), and hovering a heading
reveals a `#` permalink. See [headings](headings).

```md
Jump to [Setup](#setup), then read the [Notes](#notes).
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

## External links

`http(s)://` and `mailto:` targets open outside the book, per the viewer's link
policy (a new tab with modifier keys held). `javascript:` and other unsafe schemes
are neutralised.

## Autolinks

Bare URLs become links automatically, as on GitHub:
`https://example.com`.

## Compile-time validation

The compiler checks in-book ids where it can: every id in [toc.yaml](toc-yaml) and
every in-book entry in a page's `related` list must name an existing page, or the
build fails. Cross-book ids are stored as-is — the other book compiles separately —
and resolve (or hide) at view time.

## The See also footer

For curated onward reading, list page ids in the page's `related` frontmatter instead
of weaving links into prose — the viewer renders them as a **See also** footer, using
the same two id forms. See [related (frontmatter)](frontmatter-related).
