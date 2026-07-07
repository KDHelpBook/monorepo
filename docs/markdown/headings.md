---
title: Headings & paragraphs
keywords: [headings, paragraphs, title, structure]
categories: [structure]
related: [text-formatting, frontmatter]
---

# Headings & paragraphs

Use `#` for headings — one to six `#` for levels 1–6. A blank line separates
paragraphs; a single newline inside a paragraph is treated as a space.

```md
# Page title (H1)

## A section

### A subsection

Regular paragraph text. This second line joins the
same paragraph because there is no blank line between them.

A new paragraph starts after a blank line.
```

## Anchors

Every heading is given an `id` — the slug of its text — and a hover-revealed `#`
permalink, so a section can be deep-linked with a [`#slug` anchor](links). Cross-page
navigation still comes from the docset's `toc.yaml` / folder structure.

```md
## Where to start

…later, from anywhere on this page…
Jump back to [Where to start](#where-to-start).
```

## Notes for kdhelp

- The **first H1** is used as the page title when the frontmatter has no explicit
  `title` — see [frontmatter](frontmatter).
- Keep exactly one H1 per page (the title); start body sections at H2.
- An on-page "On this page" table of contents (a rail listing the headings) is on the
  roadmap — see the [overview](overview).
