---
title: Links
keywords: [links, internal, cross-book, autolink, see also, anchor]
categories: [inline]
related: [images-and-assets, frontmatter]
---

# Links

kdhelp understands four kinds of link.

```md
External:   [Nuxt UI](https://ui.nuxt.com)
In-book:    [Writing pages](#writing-pages)
Cross-book: [SDK reference](sample-sdk:overview)
Autolink:   https://example.com
```

## In-book links — `#page-id`

A link whose target is `#some-id` points at **another page in the same book** with
that id (not an in-page heading anchor). The viewer resolves it and navigates in the
current tab.

```md
See [Writing pages](#writing-pages) for the frontmatter fields.
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

## Notes for kdhelp

- External links open per the viewer's link policy (a new tab with modifiers);
  `javascript:` and other unsafe schemes are neutralised.
- For a curated **See also** footer instead of inline links, list related page ids in
  the page's `related` frontmatter — see [frontmatter](#frontmatter).
