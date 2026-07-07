---
title: Footnotes
keywords: [footnotes, references, citations]
categories: [blocks]
related: [links, blockquotes]
---

# Footnotes

Footnotes are a GitHub-flavoured extension, which kdhelp enables. Place a reference
`[^id]` in the text and define it anywhere in the page.

```md
kdhelp stores rendered HTML, never the source Markdown[^format].

[^format]: The optional `md` column is an enrichment for AI export, not the render.
```

Renders with a numbered marker[^demo] and a collected list of notes at the foot of the
page.

[^demo]: This is the footnote's text; the viewer links the marker to it and back.

## Notes for kdhelp

- Footnote ids are page-local; the same `[^1]` on two pages doesn't collide.
- The compiler gathers all definitions into a footnotes section at the end of the
  rendered page, regardless of where you wrote them.
