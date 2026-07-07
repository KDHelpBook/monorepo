---
title: Text formatting
keywords: [bold, italic, strikethrough, inline code, emphasis, line break, horizontal rule]
categories: [markdown]
related: [headings, code-blocks, differences]
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

> [!WARNING]
> Raw inline HTML is **escaped, not rendered** — docsets may come from untrusted
> sources, so `<b>x</b>` in Markdown shows as literal text. Use Markdown, not HTML.

Attribute syntax (`{.class}` on a span) is not supported either, and there are no
inline components — see [Differences from GitHub Markdown](differences).

## Line breaks & rules

- A **hard line break** is two trailing spaces at the end of a line, or a backslash `\`.
- Three or more `-`, `*`, or `_` on their own line make a **horizontal rule**:

```md
First line\
forced onto a new line.

---
```
