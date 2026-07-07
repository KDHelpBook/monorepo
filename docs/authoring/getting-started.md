---
title: Getting started
keywords: [getting started, quick start, first book, tutorial, compile, docset, viewer]
categories: [authoring]
related: [compiling, docset-toml, frontmatter, khb-publishing:getting-published]
---

# Getting started

A KD Help Book starts as a plain folder. This page takes you from an empty directory
to a compiled `.khb` open in the viewer.

## 1. Create the source folder

A book needs only two files — a manifest and a page:

~~~code-tree
```toml [my-docs/docset.toml]
id = "my-docs"
title = "My Documentation"
version = "0.1.0"
language = "en"
```
```md [my-docs/welcome.md]
---
title: Welcome
keywords: [welcome, introduction]
---

# Welcome

The first page of **my book**. Plain GitHub-flavoured Markdown works as-is.
```
~~~

Those four manifest fields are the core; [docset.toml](docset-toml) covers the rest.
Every `*.md` file in the folder becomes a page whose id is its file name —
`welcome.md` → `welcome` — and the YAML block on top is the page's optional
[frontmatter](frontmatter).

## 2. Compile it

Point `khb compile` at the folder and name the output:

~~~code-preview
```bash
khb compile my-docs -o my.khb
```
```
compiled my-docs (1 pages, language en) -> my.khb
```
~~~

The compiler validates the book as it builds — broken table-of-contents ids, unknown
`related` pages, or malformed math fail the compile rather than shipping broken. See
[Compiling a book](compiling) for the options and the full list of checks.

## 3. Open it in the viewer

In the KD Help Book Viewer, choose **File → Open docset…** and pick `my.khb` — or
simply **drag the file onto the window**. The book appears in the Contents tree, its
pages join the Index and Search, and it's remembered for your next visit.

## Next steps

- Add more pages, then shape the tree with a [toc.yaml](toc-yaml).
- Fill in [keywords](frontmatter-keywords), [categories](frontmatter-categories) and
  [related](frontmatter-related) so the Index, the category filter and the See-also
  footers light up.
- Bundle images and downloads under `assets/` — see [Images & assets](images).
- Ready to put the book on a website? Continue with
  [Getting published](khb-publishing:getting-published) in *Publishing KD Help Books*.
