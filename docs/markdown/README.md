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
| Bold, italic, strikethrough, inline code, line breaks | [text-formatting.md](text-formatting.md) |
| Ordered / unordered / nested lists, task lists | [lists.md](lists.md) |
| Links: in-page `#slug`, in-book `page-id`, cross-book, external, autolinks | [links.md](links.md) |
| Emoji `:shortcode:` | [emoji.md](emoji.md) |
| Images & downloadable files (the `asset:` scheme) | [images-and-assets.md](images-and-assets.md) |
| Fenced code blocks + syntax highlighting | [code-blocks.md](code-blocks.md) |
| Tables (GFM) | [tables.md](tables.md) |
| Blockquotes | [blockquotes.md](blockquotes.md) |
| Callouts (`> [!NOTE]` alerts) | [callouts.md](callouts.md) |
| Math (`$…$` → MathML) | [math.md](math.md) |
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
sandbox), while generic directives compile to plain `<div class="…">`. And comrak 0.53
**has a native `block_directive` extension** (`:::warning … :::` → `<div class="warning">`),
so the container-directive form is a flag away — no custom parser needed for the static
blocks (tabs still need frame JS for the interactivity).

**Recommendation:** don't reach for a `:::` directive parser for the code features.
Split by shape:

- **Per-block properties** (filename, `collapse`, `{2,4-6}` line-highlight) → **flags on the
  fence info string** (`` ```rust [main.rs] collapse ``), which we already carry through
  to `data-meta`. No new grammar.
- **Containers over several blocks** (code group / preview / tree) → an **opaque
  `~~~name … ~~~` fence** that comrak renders as one `language-name` block; we
  post-process its verbatim body exactly like the math pass — no `render.unsafe`, no AST
  surgery, no directive parser.

Reserve true `:::` **generic directives** (never MDC) for a later day, if we add
genuinely generic non-code blocks (tabs / cards / steps outside code).

### Roadmap

Done so far: heading **anchors** + an **"On this page"** box, **emoji**, code-block
**filenames**, a **copy** button, **collapsible** code (`collapse` flag), **line-highlight**
(`{2,4-6}`), and the full code-component set — **groups** (`~~~code-group` → tabs),
**command+output** (`~~~code-preview` → terminal panel), and **file trees**
(`~~~code-tree`) — plus **callouts** (comrak 0.53 native `alerts`), **math** (`$…$` and
`` $`…`$ ``/```math → build-time MathML), **inline marks** (`==mark==`, `++ins++`,
`^sup^`, `~sub~`, `__u__`, `||spoiler||`), **figures** (image title → `<figcaption>`),
**description lists**, and **inline footnotes** (`^[…]`).
What's left (all non-code blocks):

| Want | How | Effort |
|------|-----|--------|
| **Tabs / cards / steps / badges** (non-code) | true `:::` generic directives → `<div class>` (not MDC; comrak 0.53 has a native `block_directive` extension) | medium |
| **Diagrams** (`` ```mermaid ``) | render to **SVG at build time** (like math → MathML), so it stays static + sandbox-safe. Engine TBD — Mermaid needs node/`mmdc`; Graphviz/D2 have native CLIs | medium–large |
| **Video / embeds** | a `:video`/`:embed` directive → sandboxed `<iframe>`/`<video>` | medium |
| **Inline-code highlight** (`` `x`{:ts} ``) | per-block info-string flag | small (deferred) |

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
- [Math](math.md)
- [Footnotes](footnotes.md)
- [Frontmatter](frontmatter.md)
