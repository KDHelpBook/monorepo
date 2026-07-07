---
title: Lists & task lists
keywords: [lists, ordered, unordered, nested, task list, checkbox]
categories: [structure]
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

## Description lists

A **term** on its own line, then a line starting with `: ` for its **definition**, makes
a description list (`<dl>`):

```md
Docset
: A compiled `.khb` — one book.

Collection
: Several docsets that merge into one tree.
```

Docset
: A compiled `.khb` — one book.

Collection
: Several docsets that merge into one tree.

## Notes for KD Help Book

- Ordered lists renumber automatically — the actual starting number is respected, but
  subsequent items follow in sequence.
- List items can contain paragraphs, code blocks, and nested lists; indent
  continuation content to line up under the item's text.
