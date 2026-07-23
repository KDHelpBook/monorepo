
# title (frontmatter)

The page's display title.

## Syntax

```yaml
title: Writing pages
```

## Default

Falls back to the page's first `# H1`, then to the page [id](frontmatter-id.md). In
practice you rarely need the field: keep one H1 equal to the title you want and omit
it — set it only when the two must differ.

## Example

```md
---
title: Writing pages
---

# Writing pages

…
```

## In the viewer

The title labels the page everywhere: the table-of-contents entry (unless a
[toc.yaml node overrides it](toc-nodes.md)), the tab caption, search results, and the
link text of **See also** entries pointing at this page.
