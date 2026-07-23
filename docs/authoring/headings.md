---
title: Headings & paragraphs
keywords: [headings, paragraphs, title, structure, anchors, permalink, sections]
categories: [markdown]
related: [text-formatting, frontmatter-title, frontmatter-toc]
---

# Headings & paragraphs

Use `#` for headings — one to six `#` for levels 1–6. A blank line separates
paragraphs; a single newline inside a paragraph is treated as a space.

```ext:example
# Page title (H1)

## A section

### A subsection

Regular paragraph text. This second line joins the
same paragraph because there is no blank line between them.

A new paragraph starts after a blank line.
```

The **first H1** is used as the page title when the frontmatter has no explicit
`title` — see [title (frontmatter)](frontmatter-title). Keep exactly one H1 per
page (the title) and start body sections at H2.

## Anchors

Every heading is given an `id` — the slug of its text — and a hover-revealed `#`
permalink, so a section can be deep-linked with a [`#slug` anchor](links). Cross-page
navigation still comes from the docset's `toc.yaml` / folder structure.

```ext:example
## Where to start

…later, from anywhere on this page…
Jump back to [Where to start](#where-to-start).
```

Headings also drive the **"On this page"** navigation box: a page with two or more
top-level sections gets one automatically, built from its headings. Force it on or
off with `toc: true` / `toc: false` in the frontmatter — see
[toc (frontmatter)](frontmatter-toc).
