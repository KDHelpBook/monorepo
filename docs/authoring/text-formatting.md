---
title: Text formatting
keywords: [bold, italic, strikethrough, underline, highlight, superscript, subscript, inline code, line break]
categories: [markdown]
related: [headings, code-blocks, differences]
---

# Text formatting

Inline styling uses the usual Markdown markers, strikethrough included — exactly as
on GitHub.

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

## Highlight, underline, super- and subscript

Four inline marks beyond GitHub Markdown:

```md
==highlighted==, __underlined__
H~2~O and E = mc^2^
```

Renders as: ==highlighted==, __underlined__, H~2~O and E = mc^2^.

Two of them deliberately change what plain Markdown would mean:

> [!IMPORTANT]
> `__x__` is **underline** here, not bold — write bold as `**x**`. A single tilde
> `~x~` is **subscript**, not strikethrough — that stays `~~x~~`. A literal tilde in
> prose is escaped as `\~` (e.g. \~5 min).

## Line breaks & rules

- A **hard line break** is two trailing spaces at the end of a line, or a backslash `\`.
- Three or more `-`, `*`, or `_` on their own line make a **horizontal rule**:

```md
First line\
forced onto a new line.

---
```
