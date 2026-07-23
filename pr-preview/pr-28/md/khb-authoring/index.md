
# Authoring KD Help Books

A **KD Help Book** is a folder of Markdown pages plus a small `docset.toml` manifest,
compiled by the `khb` CLI into a single-file **`.khb` docset** that the KD Help Book
Viewer renders — with a table of contents, a keyword index, full-text search, and
offline reading. Pages are rendered to HTML **once, at build time**; the viewer never
runs a Markdown engine, so what you compile is exactly what readers see.

This book is the author's guide: everything you can put in a source folder, and what
each piece does in the viewer.

## How this guide is organized

- **[Getting started](getting-started.md)** — a minimal book, from an empty folder to a
  `.khb` open in the viewer.
- **[Differences from GitHub Markdown](differences.md)** — what KD Help Book adds on top
  of GFM, and the few things it deliberately doesn't render.
- **[Compiling a book](compiling.md)** — the `khb compile` command, its options, and the
  write–compile–preview loop.
- **Reference** — one page per construct and field:
  - **Markdown** — the GFM core: [headings](headings.md),
    [text formatting](text-formatting.md), [lists](lists.md), [links](links.md),
    [images & assets](images.md), [tables](tables.md), [blockquotes](blockquotes.md),
    [code blocks](code-blocks.md), [footnotes](footnotes.md), [emoji](emoji.md).
  - **Markdown extensions** — the KD Help Book additions sit with their base
    construct: [galleries](images.md) (in Images & assets), [callouts](blockquotes.md)
    (in Blockquotes), and the [code extensions](code-blocks.md) (in Code blocks);
    plus [math](math.md), [diagrams](diagrams.md), and [directives](directives.md).
  - **[Frontmatter](frontmatter.md)** — the per-page metadata fields.
  - **[docset.toml](docset-toml.md)** — the book manifest.
  - **[toc.yaml](toc-yaml.md)** — the table-of-contents file.

## Quick links

| I want to… | Read |
|------------|------|
| Build my first book | [Getting started](getting-started.md) |
| Link between pages and books | [Links](links.md) |
| Bundle images or downloadable files | [Images & assets](images.md) |
| Put tabs, terminals, or file trees around code | [Code blocks](code-blocks.md) |
| Get a page into the keyword index | [keywords (frontmatter)](frontmatter-keywords.md) |
| Shape the table of contents | [toc.yaml](toc-yaml.md) |
| Publish the compiled book as a site | [Getting published](khb-publishing:getting-published) |

> [!NOTE]
> This book eats its own dog food: every page in `docs/authoring/` carries the
> frontmatter it documents, and the folder compiles straight into a `.khb`
> (`khb compile docs/authoring -o authoring.khb`) — quite possibly the copy you are
> reading now.
