---
id: index
title: Authoring KD Help Books
keywords: [authoring, guide, docset, khb, book, Markdown, overview]
categories: [authoring]
related: [getting-started, differences, compiling]
---

# Authoring KD Help Books

A **KD Help Book** is a folder of Markdown pages plus a small `docset.toml` manifest,
compiled by the `khb` CLI into a single-file **`.khb` docset** that the KD Help Book
Viewer renders — with a table of contents, a keyword index, full-text search, and
offline reading. Pages are rendered to HTML **once, at build time**; the viewer never
runs a Markdown engine, so what you compile is exactly what readers see.

This book is the author's guide: everything you can put in a source folder, and what
each piece does in the viewer.

## How this guide is organized

- **[Getting started](getting-started)** — a minimal book, from an empty folder to a
  `.khb` open in the viewer.
- **[Differences from GitHub Markdown](differences)** — what KD Help Book adds on top
  of GFM, and the few things it deliberately doesn't render.
- **[Compiling a book](compiling)** — the `khb compile` command, its options, and the
  write–compile–preview loop.
- **Reference** — one page per construct and field:
  - **Markdown** — the GFM core: [headings](headings),
    [text formatting](text-formatting), [lists](lists), [links](links),
    [images](images), [tables](tables), [blockquotes](blockquotes),
    [code blocks](code-blocks), [footnotes](footnotes), [emoji](emoji).
  - **Markdown Extensions** — the KD Help Book additions: [callouts](callouts),
    [math](math), [page links](page-links), [assets](assets), and the
    [code extensions](code-extensions).
  - **[Frontmatter](frontmatter)** — the per-page metadata fields.
  - **[docset.toml](docset-toml)** — the book manifest.
  - **[toc.yaml](toc-yaml)** — the table-of-contents file.

## Quick links

| I want to… | Read |
|------------|------|
| Build my first book | [Getting started](getting-started) |
| Link between pages and books | [Page links](page-links) |
| Bundle images or downloadable files | [Images](images) / [Assets](assets) |
| Put tabs, terminals, or file trees around code | [Code extensions](code-extensions) |
| Get a page into the keyword index | [keywords (frontmatter)](frontmatter-keywords) |
| Shape the table of contents | [toc.yaml](toc-yaml) |
| Publish the compiled book as a site | [Getting published](khb-publishing:getting-published) |

> [!NOTE]
> This book eats its own dog food: every page in `docs/authoring/` carries the
> frontmatter it documents, and the folder compiles straight into a `.khb`
> (`khb compile docs/authoring -o authoring.khb`) — quite possibly the copy you are
> reading now.
