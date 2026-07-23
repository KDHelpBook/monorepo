
# Differences from GitHub Markdown

The baseline is **GitHub-flavoured Markdown**: tables, task lists, strikethrough,
autolinks and footnotes all work exactly as on GitHub. On top of that KD Help Book
adds book-aware constructs — and deliberately refuses a few things GFM tolerates.

## What KD Help Book adds

| Addition | Looks like | Reference |
|----------|------------|-----------|
| In-book & cross-book page links | `[label](page-id)`, `[label](book:page)` | [Links](links.md) |
| Bundled images & downloads | `![alt](assets/pic.svg)` | [Images & assets](images.md) |
| Callouts | `> [!NOTE]` | [Blockquotes](blockquotes.md) |
| Math, rendered to MathML at build time | `$E = mc^2$`, `$$…$$` | [Math](math.md) |
| Code: `[filename]` bar, copy button, `collapse` / `open` flags | `` ```rust [main.rs] collapse `` | [Code blocks](code-blocks.md) |
| Code groups (tabs), command+output panels, file trees | `~~~code-group`, `~~~code-preview`, `~~~code-tree` | [Code blocks](code-blocks.md) |
| Emoji shortcodes | `:tada:` | [Emoji](emoji.md) |
| Highlight, underline, insert, super-/subscript | `==x==`, `__x__`, `++x++`, `^x^`, `~x~` | [Text formatting](text-formatting.md) |
| Page metadata: keyword index, category facet, See-also footer | YAML frontmatter | [Frontmatter](frontmatter.md) |
| Heading anchors + the "On this page" box | automatic | [Headings](headings.md) |

## What is *not* supported

| Not rendered | Use instead |
|--------------|-------------|
| **Raw inline HTML** — escaped to literal text (`<b>x</b>` shows as-is) | Markdown + the extensions above — see [Text formatting](text-formatting.md) |
| Attribute syntax (`{.class}` on a span or block) | nothing — there are no inline components |
| MDC / `:::` directive blocks | fence flags and `~~~` blocks — see [Code blocks](code-blocks.md) |
| Remote images (`![…](https://…)`) — never fetched | bundle the file under `assets/` — see [Images & assets](images.md) |
| `__x__` as bold, single-tilde `~x~` as strikethrough | those marks mean **underline** / **subscript** here — bold is `**x**`, strikethrough `~~x~~` — see [Text formatting](text-formatting.md) |

> [!NOTE]
> These are deliberate design decisions, not gaps — the reasoning is described in
> [Security model](khb-internals:security-model) in *KD Help Book Internals*.
