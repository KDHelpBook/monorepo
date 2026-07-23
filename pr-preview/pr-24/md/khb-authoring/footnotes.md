
# Footnotes

Footnotes work exactly as on GitHub. Place a reference
`[^id]` in the text and define it anywhere in the page.

~~~code-preview example
```md
KD Help Book stores rendered HTML, never the source Markdown[^format].

[^format]: The optional `md` column is an enrichment for AI export, not the render.
```
```md
KD Help Book stores rendered HTML, never the source Markdown[^format].

[^format]: The optional `md` column is an enrichment for AI export, not the render.
```
~~~

Renders with a numbered marker[^demo] and a collected list of notes at the foot of the
page — definitions are gathered into that footnotes section regardless of where you
wrote them. Ids are page-local; the same `[^1]` on two pages doesn't collide.

[^demo]: This is the footnote's text; the viewer links the marker to it and back.

## Inline footnotes

For a short aside you don't want to define separately, write it inline with `^[…]`^[like
this one] — it joins the same numbered list at the foot of the page.
