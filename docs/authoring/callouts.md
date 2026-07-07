---
title: Callouts
keywords: [callout, alert, note, tip, warning, admonition]
categories: [blocks]
related: [blockquotes, text-formatting]
---

# Callouts

Set text apart in a coloured callout with GitHub-style alert syntax — a blockquote
whose first line is `[!TYPE]` (comrak's `alerts` extension).

```md
> [!NOTE]
> Useful information the reader should know.

> [!WARNING]
> Something that needs attention.
```

The five types, each with its own colour:

> [!NOTE]
> Highlights information users should take note of.

> [!TIP]
> Optional advice to do something better.

> [!IMPORTANT]
> Key information users need to succeed.

> [!WARNING]
> Urgent info that needs immediate attention.

> [!CAUTION]
> Advises about risks or negative outcomes.

## Notes for KD Help Book

- The `[!TYPE]` marker must be **uppercase and alone on the first line**; anything else
  renders as a plain [blockquote](blockquotes).
- A callout can hold multiple paragraphs, lists, and code — just keep them inside the
  `>` quote.
