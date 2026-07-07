---
title: Footnotes
keywords: [footnotes, references, citations]
categories: [blocks]
related: [links, blockquotes]
---

# Footnotes

Footnotes are a GitHub-flavoured extension, which KD Help Book enables. Place a reference
`[^id]` in the text and define it anywhere in the page.

```md
KD Help Book stores rendered HTML, never the source Markdown[^format].

[^format]: The optional `md` column is an enrichment for AI export, not the render.
```

Renders with a numbered marker[^demo] and a collected list of notes at the foot of the
page.

[^demo]: This is the footnote's text; the viewer links the marker to it and back.

## Inline footnotes

For a short aside you don't want to define separately, write it inline with `^[…]`^[like
this one] — it joins the same numbered list at the foot of the page.

## Notes for KD Help Book

- Footnote ids are page-local; the same `[^1]` on two pages doesn't collide.
- The compiler gathers all definitions into a footnotes section at the end of the
  rendered page, regardless of where you wrote them.
