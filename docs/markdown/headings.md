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

## Notes for kdhelp

- The **first H1** is used as the page title when the frontmatter has no explicit
  `title` — see [frontmatter](#frontmatter).
- Headings do **not** yet generate in-page anchors or an on-page table of contents;
  navigation comes from the docset's `toc.yaml` / folder structure. (Heading anchors
  via comrak's `header_ids` are on the roadmap — see the [overview](#overview).)
- Keep exactly one H1 per page (the title); start body sections at H2.
