---
title: Links
keywords: [links, anchor, slug, external, autolink, URL, permalink]
categories: [markdown]
related: [page-links, headings, images]
---

# Links

Standard Markdown `[label](target)` links, distinguished purely by the target:

```md
In-page anchor: [Setup](#setup)
External:       [Nuxt UI](https://ui.nuxt.com)
Autolink:       https://example.com
```

Targets that name **another page** — a bare `page-id` or a cross-book
`docsetId:pageId` — are a KD Help Book extension, covered in
[Page links](page-links).

## In-page anchors — `#slug`

A `#slug` target scrolls to the **heading on the current page** whose id is `slug`.
Every heading gets an id automatically (the slug of its text), and hovering a heading
reveals a `#` permalink. See [headings](headings).

```md
Jump to [Setup](#setup), then read the [Notes](#notes).
```

## External links

`http(s)://` and `mailto:` targets open outside the book, per the viewer's link
policy (a new tab with modifier keys held).

## Autolinks

Bare URLs (a GitHub-flavoured extension, enabled) become links automatically:
`https://example.com`.

## Notes for KD Help Book

- `javascript:` and other unsafe schemes are neutralised — docsets are untrusted.
- For a curated **See also** footer instead of inline links, list related page ids in
  the page's `related` frontmatter — see [related (frontmatter)](frontmatter-related).
