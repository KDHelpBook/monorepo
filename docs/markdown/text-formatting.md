---
title: Text formatting
keywords: [bold, italic, strikethrough, inline code, emphasis, line break, highlight, mark, insert, superscript, subscript, underline, spoiler]
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
- Attribute syntax (`{.class}` on a span) is **not** supported; there are no inline
  components. See the MDC discussion in the [overview](index).
