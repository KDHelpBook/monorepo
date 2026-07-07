---
title: Links
keywords: [links, internal, cross-book, autolink, see also, anchor]
categories: [inline]
related: [images-and-assets, frontmatter]
---

# Links

KD Help Book understands five kinds of link, distinguished purely by the target:

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
viewer navigates to it in the current tab.

```md
See [Writing pages](writing-pages) for the frontmatter fields.
```

## Cross-book links — `docsetId:pageId`

When several docsets are loaded together, link across them with a namespaced target.
The viewer hides the link if that book isn't loaded.

```md
See the [SDK overview](sample-sdk:overview).
```

## Autolinks

Bare URLs (a GitHub-flavoured extension, enabled) become links automatically:
`https://example.com`.

## Notes for KD Help Book

- External links open per the viewer's link policy (a new tab with modifiers);
  `javascript:` and other unsafe schemes are neutralised.
- For a curated **See also** footer instead of inline links, list related page ids in
  the page's `related` frontmatter — see [frontmatter](frontmatter).
