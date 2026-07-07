---
title: Text formatting
keywords: [bold, italic, strikethrough, insert, underline, highlight, superscript, subscript, inline code, line break, horizontal rule]
categories: [markdown]
related: [headings, code-blocks, differences]
---

# Text formatting

Inline styling uses the usual Markdown markers — the GitHub ones work exactly as on
GitHub, and a few extra marks come on top.

> [!WARNING]
> Raw inline HTML is **escaped, not rendered** — `<b>x</b>` shows up on the page as
> literal text. Use Markdown, not HTML.

Attribute syntax (`{.class}` on a span) is not supported either, and there are no
inline components — see [Differences from GitHub Markdown](differences).

## Bold

Double asterisks make strong emphasis — key terms on first use, UI labels, the one
word a skimming reader must not miss.

```md
Press **Compile** to build the book.
```

Renders as: Press **Compile** to build the book.

## Italic

Single asterisks make light emphasis — a stressed word, a book title, a term used
in a borrowed sense.

```md
The id is *stable*: links keep working after a rename.
```

Renders as: The id is *stable*: links keep working after a rename.

## Bold italic

Triple asterisks combine both — rare, for the strongest inline stress.

```md
Back up the file ***before*** converting it.
```

Renders as: Back up the file ***before*** converting it.

## Strikethrough

Double tildes cross text out — something that no longer applies but should stay
visible, like a superseded value or a corrected claim.

```md
The limit is ~~10~~ 25 attachments.
```

Renders as: The limit is ~~10~~ 25 attachments.

## Insert

Double pluses mark text as an addition — the counterpart of strikethrough, for
diff-style edits where the old and the new stand side by side.

```md
The limit is ~~10~~ ++25++ attachments.
```

Renders as: The limit is ~~10~~ ++25++ attachments.

## Inline code

Backticks typeset identifiers verbatim in monospace — file names, ids, field values,
anything a reader might type.

```md
Set `language = "en"` in `docset.toml`.
```

Renders as: Set `language = "en"` in `docset.toml`.

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

## Line breaks

A blank line starts a new paragraph. For a **hard line break** inside one — an
address, a verse — end the line with a backslash (or two trailing spaces):

```md
First line\
forced onto a new line.
```

Renders as:

First line\
forced onto a new line.

## Horizontal rules

Three or more `-`, `*`, or `_` alone on a line draw a divider — a scene change
between passages that don't deserve separate headings:

```md
---
```

Renders as:

---
