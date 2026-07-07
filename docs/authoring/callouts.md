---
title: Callouts
keywords: [callout, alert, note, tip, warning, admonition]
categories: [extensions]
related: [blockquotes, text-formatting, differences]
---

# Callouts

Set text apart in a coloured callout with GitHub-style alert syntax — a blockquote
whose first line is `[!TYPE]`.

```md
> [!NOTE]
> Useful information the reader should know.

> [!WARNING]
> Something that needs attention.
```

The `[!TYPE]` marker must be **uppercase and alone on the first line**; anything else
renders as a plain [blockquote](blockquotes). A callout can hold multiple paragraphs,
lists, and code — just keep them inside the `>` quote.

The five types, each with its own colour — the source, then how it renders:

```md
> [!NOTE]
> Highlights information users should take note of.
```

> [!NOTE]
> Highlights information users should take note of.

```md
> [!TIP]
> Optional advice to do something better.
```

> [!TIP]
> Optional advice to do something better.

```md
> [!IMPORTANT]
> Key information users need to succeed.
```

> [!IMPORTANT]
> Key information users need to succeed.

```md
> [!WARNING]
> Urgent info that needs immediate attention.
```

> [!WARNING]
> Urgent info that needs immediate attention.

```md
> [!CAUTION]
> Advises about risks or negative outcomes.
```

> [!CAUTION]
> Advises about risks or negative outcomes.
