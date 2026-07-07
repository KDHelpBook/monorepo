---
title: Lists & task lists
keywords: [lists, ordered, unordered, nested, task list, checkbox]
categories: [markdown]
related: [text-formatting, tables]
---

# Lists & task lists

Unordered lists use `-` (or `*` / `+`); ordered lists use `1.`. Nest by indenting
the child items.

```md
- First
- Second
  - Nested under second
  - Another nested item
- Third

1. Step one
2. Step two
```

Ordered lists renumber automatically — the actual starting number is respected, but
subsequent items follow in sequence. List items can contain paragraphs, code blocks,
and nested lists; indent continuation content to line up under the item's text.

## Task lists

Task lists are a GitHub-flavoured extension (enabled): `- [ ]` for an open item and
`- [x]` for a done one.

```md
- [x] Compile the docset
- [ ] Publish it
```

Renders as:

- [x] Compile the docset
- [ ] Publish it
