---
title: Tables
keywords: [tables, GFM, columns, alignment, pipe table]
categories: [markdown]
related: [lists, blockquotes]
---

# Tables

Pipe tables are a GitHub-flavoured extension, which KD Help Book enables. The header row is
separated from the body by a row of dashes; colons in that separator set column
alignment.

```md
| Prop  | Default | Type   |
|-------|:-------:|-------:|
| name  |         | string |
| size  | md      | string |
```

Renders as:

| Prop  | Default | Type   |
|-------|:-------:|-------:|
| name  |         | string |
| size  | md      | string |

- `:---` left-aligns, `:--:` centres, `---:` right-aligns.
- Cells are inline Markdown, so `**bold**`, `` `code` `` and links work inside them.

## Notes for KD Help Book

- Wide tables scroll horizontally inside the content frame rather than breaking the
  layout.
- There is no cell-spanning or nested-block syntax — tables are for tabular data;
  reach for lists or headings for richer structure.
