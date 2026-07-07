---
title: Frontmatter
keywords: [frontmatter, metadata, YAML, fields, page metadata, index]
categories: [configuration]
related: [docset-toml, toc-yaml, getting-started]
---

# Frontmatter

Each page may begin with a YAML **frontmatter** block, fenced by `---`, that sets the
page's metadata. Every field is optional — a page of pure Markdown is a valid page.

```md
---
id: writing-pages
title: Writing pages
keywords: [Markdown, frontmatter, authoring]
categories: [authoring]
related: [table-of-contents, other-book:overview]
toc: true
---

# Writing pages

Body content…
```

The block is stripped before rendering — it never appears in the page body.

## Fields

| Field | Sets | Details |
|-------|------|---------|
| `id` | the page's stable id (defaults to the file name) | [id](frontmatter-id) |
| `title` | the display title in the TOC, tabs and search | [title](frontmatter-title) |
| `keywords` | the page's entries in the keyword index | [keywords](frontmatter-keywords) |
| `categories` | facet tags for the category filter | [categories](frontmatter-categories) |
| `related` | the **See also** footer | [related](frontmatter-related) |
| `toc` | forces the "On this page" box on or off | [toc](frontmatter-toc) |

## Notes for KD Help Book

- A frontmatter block that doesn't parse (or isn't terminated by a closing `---`)
  fails the [compile](compiling).
- This whole book is authored with these fields — open any page's source under
  `docs/authoring/` for a live example.
