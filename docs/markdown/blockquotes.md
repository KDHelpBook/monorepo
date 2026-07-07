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

- Styled **callouts** (note / tip / warning / caution) are **not** a plain blockquote;
  they need GitHub-alert syntax (`> [!NOTE]`), which is on the roadmap in the
  [overview](#overview). For now a blockquote is the way to set text apart.
