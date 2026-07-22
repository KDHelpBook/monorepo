---
title: Lists & task lists
keywords: [lists, ordered, unordered, nested, task list, checkbox, starting number]
categories: [markdown]
related: [text-formatting, tables]
---

# Lists & task lists

All the GitHub list flavours work here: bulleted, numbered (with a chosen starting
number), nested to any depth, and check-box task lists.

## Unordered lists

A `-` at the start of a line makes a bullet item (`*` and `+` work too — pick one
and stay consistent).

~~~code-preview example
```md
- Compile the book
- Open it in the viewer
- Publish
```
```md
- Compile the book
- Open it in the viewer
- Publish
```
~~~

## Ordered lists

A number and a dot make a numbered item. Only the **first** number matters — items
renumber automatically from it, so a lazy `1. / 1. / 1.` still counts up and
inserting a step never means renumbering the rest by hand.

~~~code-preview example
```md
1. Write a page
1. Compile
1. Preview
```
```md
1. Write a page
1. Compile
1. Preview
```
~~~

To start elsewhere, give the first item that number — handy when a procedure
continues after an interruption, like a code block or a paragraph:

~~~code-preview example
```md
4. Package the viewer
5. Deploy
```
```md
4. Package the viewer
5. Deploy
```
~~~

## Nested lists

Indent child items under their parent (align with the parent's text). Bullets and
numbers can mix freely across levels.

~~~code-preview example
```md
1. Prepare the source
   - docset.toml
   - at least one page
2. Compile
```
```md
1. Prepare the source
   - docset.toml
   - at least one page
2. Compile
```
~~~

An item can also hold whole paragraphs or code blocks — indent that continuation
content to line up under the item's text.

## Task lists

Task lists work exactly as on GitHub: `- [ ]` for an open item and
`- [x]` for a done one.

~~~code-preview example
```md
- [x] Compile the docset
- [ ] Publish it
```
```md
- [x] Compile the docset
- [ ] Publish it
```
~~~

## Description lists

A **term** on its own line, then a line starting with `: ` for its **definition**, makes
a description list (`<dl>`):

~~~code-preview example
```md
Docset
: A compiled `.khb` — one book.

Collection
: Several docsets that merge into one tree.
```
```md
Docset
: A compiled `.khb` — one book.

Collection
: Several docsets that merge into one tree.
```
~~~
