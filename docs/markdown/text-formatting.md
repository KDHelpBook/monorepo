---
title: Text formatting
keywords: [bold, italic, strikethrough, inline code, emphasis, line break, highlight, mark, insert, superscript, subscript, underline, spoiler, badge, inline code highlight]
categories: [inline]
related: [headings, code-blocks]
---

# Text formatting

Inline styling uses the usual Markdown markers. Strikethrough is a GitHub-flavoured
extension, which KD Help Book enables.

```md
**bold**, *italic*, ***bold italic***
~~strikethrough~~
`inline code`
```

Renders as: **bold**, *italic*, ***bold italic***, ~~strikethrough~~, `inline code`.

## More inline marks

Extra comrak extensions add a few more inline marks:

| Write | Renders | Element |
|-------|---------|---------|
| `==highlight==` | ==highlight== | `<mark>` |
| `++inserted++` | ++inserted++ | `<ins>` |
| `super^script^` | super^script^ | `<sup>` |
| `H~2~O` (single `~`) | H~2~O | `<sub>` |
| `__underline__` | __underline__ | `<u>` |
| `\|\|spoiler\|\|` | ||spoiler|| (click to reveal) | `<span class="spoiler">` |

Two tildes stay **strikethrough** (`~~x~~`), one is **subscript** (`~x~`) — comrak tells
them apart by count. **Bold is `**`**, so `__` is free for underline. A **spoiler** is
blacked out until you click it.

## Inline code attributes

An inline `` `code` `` span can carry a `{…}` attribute **immediately after** the closing
backtick:

| Write | Renders | Effect |
|-------|---------|--------|
| `` `let x = 1;`{:rust} `` | `let x = 1;`{:rust} | syntax-highlight the snippet, in that language |
| `` `Beta`{.badge} `` | `Beta`{.badge} | a neutral badge pill |
| `` `New`{.badge-green} `` | `New`{.badge-green} | a coloured badge (`blue` / `green` / `amber` / `red`) |

`{:lang}` highlights the code with the same engine as fenced blocks (build-time syntect,
so no runtime highlighter). `{.badge…}` turns the code into a small pill — handy for
version tags and status labels. The brace must touch the closing backtick; a `{…}` after
a space is just text.

## Line breaks & rules

- A **hard line break** is two trailing spaces at the end of a line, or a backslash `\`.
- Three or more `-`, `*`, or `_` on their own line make a **horizontal rule**:

```md
First line\
forced onto a new line.

---
```

## Notes for KD Help Book

- **Raw inline HTML is escaped, not rendered** — docsets may come from untrusted
  sources, so `<b>x</b>` in Markdown shows as literal text. Use Markdown, not HTML.
- The only inline attribute syntax is the `` `code`{…} `` form above (highlight + badge)
  — there are no general inline components. See the MDC discussion in the
  [overview](index).
