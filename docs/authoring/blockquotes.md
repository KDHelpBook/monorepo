---
title: Blockquotes
keywords: [blockquote, quote, citation, nested quote, callout, alert, note, tip, warning, admonition]
categories: [markdown, extensions]
related: [tables, footnotes, text-formatting, differences]
---

# Blockquotes

Prefix lines with `>`. Separate paragraphs inside a quote with a `>` on its own line.

```md
> A single-line quote.

> First paragraph of a quote.
>
> Second paragraph, still quoted.
```

Renders as:

> First paragraph of a quote.
>
> Second paragraph, still quoted.

Blockquotes can contain other Markdown — lists, code, even nested quotes (prefix with
`> >`).

## Fenced (multi-paragraph) blockquotes

For a long quote with several paragraphs, prefixing every line with `>` is tedious.
Fence the whole quote with `>>>` instead — everything between the markers is quoted:

```md
>>>
First paragraph of the quote.

Second paragraph — no `>` on any line.
>>>
```

Renders as:

>>>
First paragraph of the quote.

Second paragraph — no `>` on any line.
>>>

## Callouts

A plain blockquote stays neutral. For a coloured, labelled box (note / tip / warning
/ …), use a **callout** — a blockquote whose first line is a GitHub-style `[!TYPE]`
alert marker. (A **[directive](directives)** like `:::tip` is an interchangeable
alternative.)

```md
> [!NOTE]
> Useful information the reader should know.

> [!WARNING]
> Something that needs attention.
```

The `[!TYPE]` marker must be **uppercase and alone on the first line**; anything else
renders as a plain blockquote. A callout can hold multiple paragraphs, lists, and code
— just keep them inside the `>` quote.

The five types, each with its own colour — the source, then how it renders:

### Note

Background or context the reader should absorb even when skimming — the fact still
matters if they skip it, so it earns a box rather than a plain sentence.

```md
> [!NOTE]
> The compiled book works fully offline — no network access is needed to read it.
```

> [!NOTE]
> The compiled book works fully offline — no network access is needed to read it.

### Tip

Optional advice: a shortcut, a better habit, a nicer way to do the same thing.
Nothing breaks if the reader ignores it.

```md
> [!TIP]
> Name files after their page ids — links then read like the table of contents.
```

> [!TIP]
> Name files after their page ids — links then read like the table of contents.

### Important

Information the reader *needs* for the task at hand to succeed — skipping it means
something won't work, even though nothing dangerous happens.

```md
> [!IMPORTANT]
> Every page needs a unique id — two files can't share one.
```

> [!IMPORTANT]
> Every page needs a unique id — two files can't share one.

### Warning

Something that demands attention *before* the reader acts — a common trap, a
surprising behavior, a step that's easy to get wrong.

```md
> [!WARNING]
> Raw HTML is escaped, not rendered — `<b>bold</b>` shows up as literal text.
```

> [!WARNING]
> Raw HTML is escaped, not rendered — `<b>bold</b>` shows up as literal text.

### Caution

Consequences: actions that are destructive, irreversible, or costly to undo. The
strongest signal — save it for cases where acting wrongly does real damage.

```md
> [!CAUTION]
> `khb pack` starts from a clean slate — docsets already in the output directory
> are removed before the new ones are copied in.
```

> [!CAUTION]
> `khb pack` starts from a clean slate — docsets already in the output directory
> are removed before the new ones are copied in.
