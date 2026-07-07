---
title: Blockquotes
keywords: [blockquote, quote, callout]
categories: [blocks]
related: [tables, footnotes]
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

## Notes for kdhelp

- For a coloured, labelled box (note / tip / warning / …) use a **[callout](callouts)**
  — a blockquote whose first line is `[!TYPE]`. A plain blockquote stays neutral.
