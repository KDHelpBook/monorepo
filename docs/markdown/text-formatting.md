---
title: Text formatting
keywords: [bold, italic, strikethrough, inline code, emphasis, line break]
categories: [inline]
related: [headings, code-blocks]
---

# Text formatting

Inline styling uses the usual Markdown markers. Strikethrough is a GitHub-flavoured
extension, which kdhelp enables.

```md
**bold**, *italic*, ***bold italic***
~~strikethrough~~
`inline code`
```

Renders as: **bold**, *italic*, ***bold italic***, ~~strikethrough~~, `inline code`.

## Line breaks & rules

- A **hard line break** is two trailing spaces at the end of a line, or a backslash `\`.
- Three or more `-`, `*`, or `_` on their own line make a **horizontal rule**:

```md
First line\
forced onto a new line.

---
```

## Notes for kdhelp

- **Raw inline HTML is escaped, not rendered** — docsets may come from untrusted
  sources, so `<b>x</b>` in Markdown shows as literal text. Use Markdown, not HTML.
- Attribute syntax (`{.class}` on a span) is **not** supported; there are no inline
  components. See the MDC discussion in the [overview](#overview).
