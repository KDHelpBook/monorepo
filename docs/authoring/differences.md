---
title: Differences from GitHub Markdown
keywords: [GFM, differences, compatibility, extensions, unsupported, HTML, directives]
categories: [authoring, markdown]
related: [getting-started, page-links, code-extensions, callouts]
---

# Differences from GitHub Markdown

The baseline is **GitHub-flavoured Markdown**: tables, task lists, strikethrough,
autolinks and footnotes all work exactly as on GitHub. On top of that KD Help Book
adds book-aware constructs — and, because docsets render in a sandboxed frame and may
come from untrusted sources, it deliberately refuses a few things GFM tolerates.

## What KD Help Book adds

| Addition | Looks like | Reference |
|----------|------------|-----------|
| In-book & cross-book page links | `[label](page-id)`, `[label](book:page)` | [Page links](page-links) |
| Bundled images & downloads | `![alt](assets/pic.svg)` | [Assets](assets) |
| Callouts | `> [!NOTE]` | [Callouts](callouts) |
| Math, rendered to MathML at build time | `$E = mc^2$`, `$$…$$` | [Math](math) |
| Code: `[filename]` bar, copy button, `collapse` / `open` flags | `` ```rust [main.rs] collapse `` | [Code extensions](code-extensions) |
| Code groups (tabs), command+output panels, file trees | `~~~code-group`, `~~~code-preview`, `~~~code-tree` | [Code extensions](code-extensions) |
| Emoji shortcodes | `:tada:` | [Emoji](emoji) |
| Page metadata: keyword index, category facet, See-also footer | YAML frontmatter | [Frontmatter](frontmatter) |
| Heading anchors + the "On this page" box | automatic | [Headings](headings) |

## What is *not* supported

| Not rendered | Use instead |
|--------------|-------------|
| **Raw inline HTML** — escaped to literal text (`<b>x</b>` shows as-is) | Markdown + the extensions above — see [Text formatting](text-formatting) |
| Attribute syntax (`{.class}` on a span or block) | nothing — there are no inline components |
| MDC / `:::` directive blocks | fence flags and `~~~` blocks — see [Code extensions](code-extensions) |
| Remote images (`![…](https://…)`) — never fetched | bundle the file under `assets/` — see [Images](images) |

> [!NOTE]
> These are security decisions, not gaps: docsets are treated as **untrusted**, pages
> render origin-isolated and offline-first, so arbitrary HTML and network fetches are
> off the table by design.
