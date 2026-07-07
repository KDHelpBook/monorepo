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

## Highlight

Double equals signs mark text like a highlighter pen — for drawing the eye to the
key fragment of a sentence, a value in a longer line, the part that changed.

```md
Set the ==id== field before anything else.
```

Renders as: Set the ==id== field before anything else.

## Underline

Double underscores underline text — useful for terms that carry a defined meaning,
or wherever house style calls for underlining instead of italics.

```md
A __docset__ is one compiled book.
```

Renders as: A __docset__ is one compiled book.

> [!IMPORTANT]
> In plain Markdown `__x__` means bold — here it means underline. Write bold with
> asterisks only: `**x**`.

## Superscript

Carets raise text — exponents, ordinals, footnote-style markers in prose.

```md
E = mc^2^, the 4^th^ edition
```

Renders as: E = mc^2^, the 4^th^ edition.

## Subscript

Single tildes lower text — chemical formulas, variable indices.

```md
H~2~O, x~1~ … x~n~
```

Renders as: H~2~O, x~1~ … x~n~.

> [!IMPORTANT]
> In GitHub Markdown a single tilde can mean strikethrough — here it means
> subscript; strikethrough is `~~x~~` only. A literal tilde in prose is escaped as
> `\~` (e.g. \~5 min).

## Line breaks & rules

- A **hard line break** is two trailing spaces at the end of a line, or a backslash `\`.
- Three or more `-`, `*`, or `_` on their own line make a **horizontal rule**:

```md
First line\
forced onto a new line.

---
```
