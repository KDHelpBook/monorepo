---
title: Frontmatter
keywords: [frontmatter, metadata, id, title, keywords, categories, related]
categories: [authoring]
related: [headings, links]
---

# Frontmatter

Each page may begin with a YAML **frontmatter** block, fenced by `---`, that sets the
page's metadata. Every field is optional.

```md
---
id: writing-pages
title: Writing pages
keywords: [Markdown, frontmatter, authoring]
categories: [authoring]
related: [table-of-contents, categories]
---

# Writing pages

Body content…
```

## Fields

| Field | Meaning |
|-------|---------|
| `id` | The page's stable id (used by in-book links `#id` and `related`). **Defaults to the file name** without `.md`. |
| `title` | Display title in the TOC and tabs. Falls back to the first `# H1`, then the id. |
| `keywords` | Terms for the **F1 keyword index** and full-text search weighting. |
| `categories` | Facet tags (many-to-many). A category used here but absent from `categories.yaml` is auto-registered. |
| `related` | Page ids for the **See also** footer — an in-book id, or a cross-book `docsetId:pageId`. |
| `toc` | Force the on-page ["On this page"](headings) box `true`/`false`. Omitted → auto (shown only when the page has 2+ top-level sections). |

## Notes for kdhelp

- This whole `docs/markdown/` folder is authored with these fields, so it can be
  compiled straight into a `.khb` (`kdhelp compile`).
- `keywords` and `categories` power the Index and the "Filter by category" scope; see
  [links](links) for how `related` renders.
- The frontmatter is stripped before rendering — it never appears in the page body,
  and it's what the optional `md` column stores the body *without*.
