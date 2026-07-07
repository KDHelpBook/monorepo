---
id: overview
title: Markdown in kdhelp
keywords: [Markdown, syntax, MDC, directives, reference]
categories: [authoring]
related: [frontmatter, headings, code-blocks]
---

# Markdown in kdhelp

kdhelp's bundled compiler renders each page's Markdown to HTML **once, at build
time** ([comrak](https://github.com/kivikakk/comrak), GitHub-flavoured), and stores
the HTML in the `.khb`. The viewer never runs a Markdown engine. This folder documents
every construct the compiler understands — one page per feature — and each page here
carries frontmatter, so this reference is itself a compilable docset.

## Supported today

| Feature | Page |
|---------|------|
| Headings, paragraphs, heading anchors | [headings.md](headings.md) |
| Bold, italic, strikethrough, inline code, line breaks | [text-formatting.md](text-formatting.md) |
| Ordered / unordered / nested lists, task lists | [lists.md](lists.md) |
| Links: in-page `#slug`, in-book `page-id`, cross-book, external, autolinks | [links.md](links.md) |
| Emoji `:shortcode:` | [emoji.md](emoji.md) |
| Images & downloadable files (the `asset:` scheme) | [images-and-assets.md](images-and-assets.md) |
| Fenced code blocks + syntax highlighting | [code-blocks.md](code-blocks.md) |
| Tables (GFM) | [tables.md](tables.md) |
| Blockquotes | [blockquotes.md](blockquotes.md) |
| Footnotes | [footnotes.md](footnotes.md) |
| Page frontmatter (`title`, `keywords`, `categories`, `related`) | [frontmatter.md](frontmatter.md) |

**kdhelp-only** (no Docus equivalent): cross-book links `docsetId:page`, the **See
also** footer (`related`), the **F1 keyword index** (`keywords`), the **category
facet** (`categories`), and the **`asset:` scheme** with embedded/sidecar packs.

## How we compare to Docus / MDC

[Docus](https://docus.dev) is built on Nuxt and authors content in **MDC** (Markdown
Components) — `::block` / `:inline` syntax that renders **Vue components at runtime**.
That is the crux of why MDC is *not* the right target for kdhelp:

- kdhelp compiles to **static HTML** and renders it in a **sandboxed iframe with no
  framework** and deliberately restricted JS. MDC's value *is* the live Vue runtime —
  we'd have to reimplement every component as a compile-time HTML transform, and the
  interactive ones (tabs, accordion, copy button, code preview) need JS in the very
  frame we isolate for security.
- MDC is a single-ecosystem convention (Nuxt). A docset should stay portable.

**Recommendation:** when we want richer blocks, adopt **CommonMark generic directives**
(`:::note … :::`, the remark-directive / MyST / pandoc-fenced-div lineage) rather than
MDC. Directives are framework-agnostic, compile to plain `<div class="…">`, are a
de-facto standard outside Vue, and degrade gracefully. Authoring feels close to MDC
(`::` blocks) but we own the static output.

### Roadmap

Heading **anchors** and **emoji** are done (comrak `header_ids` + `shortcodes`). The
rest, roughly by effort — note some earlier "tiny" guesses were wrong: comrak **0.29
has no `alerts`** (callouts need a comrak upgrade), and `math_dollars` only *parses*
math, so visual rendering needs a LaTeX→MathML step:

| Want | How | Effort |
|------|-----|--------|
| **Callouts** (note / tip / warning / caution) | upgrade comrak → `alerts`, or a custom transform | small–medium |
| **On-page TOC** ("On this page" rail) | viewer reads the heading anchors | small |
| **Math** `$…$` | comrak `math_dollars` + a Rust LaTeX→MathML pass (native MathML) | medium |
| Code **filename** title bar | parse the ` ```ts [file.ts] ` info string | small |
| Code **copy** button | viewer-side, in the frame bridge (clipboard via parent) | small |
| **Code group / collapse / preview / tree** | a **directive** renderer + interactive frame JS | medium–large |
| **Tabs / cards / steps / badges** | the same **directive** renderer (not MDC) | medium |
| **Video / embeds** | a `:video`/`:embed` directive → sandboxed `<iframe>`/`<video>` | medium |

Deliberately **out of scope**: anything needing a live framework runtime — MDC's Vue
components, Docus's `CodePreview` live *component* output, `NuxtImg`.

## The pages

- [Headings & paragraphs](headings.md)
- [Text formatting](text-formatting.md)
- [Lists & task lists](lists.md)
- [Links](links.md)
- [Emoji](emoji.md)
- [Images & assets](images-and-assets.md)
- [Code blocks](code-blocks.md)
- [Tables](tables.md)
- [Blockquotes](blockquotes.md)
- [Footnotes](footnotes.md)
- [Frontmatter](frontmatter.md)
