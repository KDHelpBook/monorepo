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

~~~code-preview example
```md
Press **Compile** to build the book.
```
```md
Press **Compile** to build the book.
```
~~~

## Italic

Single asterisks make light emphasis — a stressed word, a book title, a term used
in a borrowed sense.

~~~code-preview example
```md
The id is *stable*: links keep working after a rename.
```
```md
The id is *stable*: links keep working after a rename.
```
~~~

## Bold italic

Triple asterisks combine both — rare, for the strongest inline stress.

~~~code-preview example
```md
Back up the file ***before*** converting it.
```
```md
Back up the file ***before*** converting it.
```
~~~

## Strikethrough

Double tildes cross text out — something that no longer applies but should stay
visible, like a superseded value or a corrected claim.

~~~code-preview example
```md
The limit is ~~10~~ 25 attachments.
```
```md
The limit is ~~10~~ 25 attachments.
```
~~~

## Insert

Double pluses mark text as an addition — the counterpart of strikethrough, for
diff-style edits where the old and the new stand side by side.

~~~code-preview example
```md
The limit is ~~10~~ ++25++ attachments.
```
```md
The limit is ~~10~~ ++25++ attachments.
```
~~~

## Inline code

Backticks typeset identifiers verbatim in monospace — file names, ids, field values,
anything a reader might type.

~~~code-preview example
```md
Set `language = "en"` in `docset.toml`.
```
```md
Set `language = "en"` in `docset.toml`.
```
~~~

## Inline code attributes

An inline `` `code` `` span can carry a `{…}` attribute **immediately after** the closing
backtick:

| Write | Effect |
|-------|--------|
| `` `let x = 1;`{:rust} `` | syntax-highlight the snippet, in that language |
| `` `Beta`{.badge} `` | a neutral badge pill |
| `` `New`{.badge-green} `` | a coloured badge (`blue` / `green` / `amber` / `red`) |

`{:lang}` highlights the code with the same engine as fenced blocks (at build time, so
no runtime highlighter). `{.badge…}` turns the code into a small pill — handy for
version tags and status labels. The brace must touch the closing backtick; a `{…}` after
a space is just text.

## Highlight

Double equals signs mark text like a highlighter pen — for drawing the eye to the
key fragment of a sentence, a value in a longer line, the part that changed.

~~~code-preview example
```md
Set the ==id== field before anything else.
```
```md
Set the ==id== field before anything else.
```
~~~

## Underline

Double underscores underline text — useful for terms that carry a defined meaning,
or wherever house style calls for underlining instead of italics.

~~~code-preview example
```md
A __docset__ is one compiled book.
```
```md
A __docset__ is one compiled book.
```
~~~

> [!IMPORTANT]
> In plain Markdown `__x__` means bold — here it means underline. Write bold with
> asterisks only: `**x**`.

## Superscript

Carets raise text — exponents, ordinals, footnote-style markers in prose.

~~~code-preview example
```md
E = mc^2^, the 4^th^ edition
```
```md
E = mc^2^, the 4^th^ edition
```
~~~

## Subscript

Single tildes lower text — chemical formulas, variable indices.

~~~code-preview example
```md
H~2~O, x~1~ … x~n~
```
```md
H~2~O, x~1~ … x~n~
```
~~~

> [!IMPORTANT]
> In GitHub Markdown a single tilde can mean strikethrough — here it means
> subscript; strikethrough is `~~x~~` only.

## Spoiler

Double pipes black out text until the reader clicks it — for hiding answers, solutions,
or plot points.

~~~code-preview example
```md
The answer is ||42||.
```
```md
The answer is ||42||.
```
~~~

## Literal characters

Every marker on this page is just a character until it pairs up — and when you mean
the *character*, a backslash before it turns the syntax off: `\~`, `\*`, `\_`,
`\+`, `\=`, `\\` for the backslash itself. In practice the tilde needs this most
(a single `~` is subscript syntax), asterisks and underscores occasionally, the
rest rarely.

~~~code-preview example
```md
Takes \~5 minutes; required fields are marked with \*.
```
```md
Takes \~5 minutes; required fields are marked with \*.
```
~~~

Inside `inline code` and code blocks nothing is ever escaped — write `~/books`,
`a * b` or `__init__` there as-is.

## Line breaks

A blank line starts a new paragraph. For a **hard line break** inside one — an
address, a verse — end the line with a backslash (or two trailing spaces):

~~~code-preview example
```md
First line\
forced onto a new line.
```
```md
First line\
forced onto a new line.
```
~~~

## Horizontal rules

Three or more `-`, `*`, or `_` alone on a line draw a divider — a scene change
between passages that don't deserve separate headings:

~~~code-preview example
```md
---
```
```md
---
```
~~~
