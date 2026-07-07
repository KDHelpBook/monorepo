---
id: index
title: Markdown in KD Help Book
keywords: [Markdown, syntax, MDC, directives, reference]
categories: [authoring]
related: [frontmatter, headings, code-blocks]
---

# Markdown in KD Help Book

KD Help Book's bundled compiler renders each page's Markdown to HTML **once, at build
time** ([comrak](https://github.com/kivikakk/comrak), GitHub-flavoured), and stores
the HTML in the `.khb`. The viewer never runs a Markdown engine. This folder documents
every construct the compiler understands — one page per feature — and each page here
carries frontmatter, so this reference is itself a compilable docset.

## Supported today

| Feature | Page |
|---------|------|
| Headings, paragraphs, heading anchors | [headings.md](headings.md) |
| Bold, italic, inline marks, inline-code highlight + badges | [text-formatting.md](text-formatting.md) |
| Ordered / unordered / nested lists, task lists | [lists.md](lists.md) |
| Links: in-page `#slug`, in-book `page-id`, cross-book, external, autolinks | [links.md](links.md) |
| Emoji `:shortcode:` | [emoji.md](emoji.md) |
| Images & downloadable files (the `asset:` scheme) | [images-and-assets.md](images-and-assets.md) |
| Fenced code blocks + syntax highlighting | [code-blocks.md](code-blocks.md) |
| Tables (GFM) | [tables.md](tables.md) |
| Blockquotes, fenced `>>>` quotes | [blockquotes.md](blockquotes.md) |
| Callouts (`> [!NOTE]` alerts) | [callouts.md](callouts.md) |
| Directives (`:::note`, `:::card`) | [directives.md](directives.md) |
| Math (`$…$` → MathML) | [math.md](math.md) |
| Diagrams (`` ```dot `` → SVG) | [diagrams.md](diagrams.md) |
| Footnotes | [footnotes.md](footnotes.md) |
| Page frontmatter (`title`, `keywords`, `categories`, `related`) | [frontmatter.md](frontmatter.md) |

**KD Help Book-only** (no Docus equivalent): cross-book links `docsetId:page`, the **See
also** footer (`related`), the **F1 keyword index** (`keywords`), the **category
facet** (`categories`), and the **`asset:` scheme** with embedded/sidecar packs.

## How we compare to Docus / MDC

[Docus](https://docus.dev) is built on Nuxt and authors content in **MDC** (Markdown
Components) — `::block` / `:inline` syntax that renders **Vue components at runtime**.
That is the crux of why MDC is *not* the right target for KD Help Book:

- KD Help Book compiles to **static HTML** and renders it in a **sandboxed iframe with no
  framework** and deliberately restricted JS. MDC's value *is* the live Vue runtime —
  we'd have to reimplement every component as a compile-time HTML transform, and the
  interactive ones (tabs, accordion, copy button, code preview) need JS in the very
  frame we isolate for security.
- MDC is a single-ecosystem convention (Nuxt). A docset should stay portable.

**On `:::` and MDC.** The colon-fence surface *overlaps*: MDC's base block is `::name`
(with `:::` for nesting), and **CommonMark generic directives** use `:::name`. But the
difference that matters isn't the colon count — it's the **semantics**: MDC resolves a
name to a **Vue component mounted at runtime** (what we can't do in a no-framework
sandbox), while generic directives compile to plain `<div class="…">`. comrak 0.53
**has a native `block_directive` extension** (`:::warning … :::` → `<div class="warning">`),
which we **enable** — it powers the callout, card, tabs, and steps
[directives](directives.md) with no custom parser. The interactive one (`:::tabs`) adds
only a tiny frame-bridge click handler over that same `<div class>` output.

**Recommendation:** don't reach for a `:::` directive parser for the code features.
Split by shape:

- **Per-block properties** (filename, `collapse`, `{2,4-6}` line-highlight) → **flags on the
  fence info string** (`` ```rust [main.rs] collapse ``), which we already carry through
  to `data-meta`. No new grammar.
- **Containers over several blocks** (code group / preview / tree) → an **opaque
  `~~~name … ~~~` fence** that comrak renders as one `language-name` block; we
  post-process its verbatim body exactly like the math pass — no `render.unsafe`, no AST
  surgery, no directive parser.

True `:::` **generic directives** (never MDC) now ship — callouts, cards, tabs, and
steps (see [directives.md](directives.md)) — the static ones pure CSS, `:::tabs` with a
small frame-bridge handler over the same `<div class>` output.

### Roadmap

Done so far: heading **anchors** + an **"On this page"** box, **emoji**, code-block
**filenames**, a **copy** button, **collapsible** code (`collapse` flag), **line-highlight**
(`{2,4-6}`), and the full code-component set — **groups** (`~~~code-group` → tabs),
**command+output** (`~~~code-preview` → terminal panel), and **file trees**
(`~~~code-tree`) — plus **callouts** (comrak 0.53 native `alerts`), **math** (`$…$` and
`` $`…`$ ``/```math → build-time MathML), **inline marks** (`==mark==`, `++ins++`,
`^sup^`, `~sub~`, `__u__`, `||spoiler||`), **figures** (image title → `<figcaption>`),
**description lists**, **inline footnotes** (`^[…]`), **container directives**
(`:::note` / `:::card` callouts + cards, `:::tabs` interactive tabs, `:::steps`
walkthroughs), **fenced blockquotes** (`>>>`), **inline-code attributes**
(`` `x`{:lang} `` highlight, `` `x`{.badge} `` badges), and **diagrams** (`` ```dot ``
→ build-time SVG via a pure-Rust Graphviz engine).
What's left:

| Want | How | Effort |
|------|-----|--------|
| **Mermaid diagrams** (`` ```mermaid ``) | opt-in on top of the DOT support — needs an external `mmdc` (node + headless browser), so it stays behind a compiler flag, never the default | medium |
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
- [Callouts](callouts.md)
- [Directives](directives.md)
- [Math](math.md)
- [Diagrams](diagrams.md)
- [Footnotes](footnotes.md)
- [Frontmatter](frontmatter.md)
