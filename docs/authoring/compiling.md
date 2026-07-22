---
title: Compiling a book
keywords: [compile, khb, CLI, build, validation, khbb, sidecar, inspect]
categories: [authoring]
related: [getting-started, images, khb-publishing:pack, khb-publishing:patch]
---

# Compiling a book

`khb compile` turns a source folder into a docset:

```bash
khb compile my-docs -o my.khb
```

## Options

| Flag | Meaning |
|------|---------|
| `-o <path>` | where to write the compiled docset |
| `--format khbb` | emit the minimal `.khbb` binary form instead of the default `.khb` (smaller to transfer; rebuilt into a `.khb` before use) |
| `--assets sidecar` | write attachments to a sibling `.khba` pack instead of embedding them in the `.khb` — see [Images & assets](images) |

## What the compiler validates

A broken book fails the compile instead of shipping broken:

- every `page:` id in [toc.yaml](toc-yaml) must name an existing page, and a folder
  node must have a `title:`;
- every in-book id in a page's [`related`](frontmatter-related) list must exist
  (cross-book `docsetId:pageId` entries are stored as-is — the other book compiles
  separately);
- every [math](math) formula must parse — the error names the page and the offending
  LaTeX;
- the [code](code-blocks) containers must be well-formed: a
  `~~~code-group` or `~~~code-tree` with no inner blocks, or a `~~~code-preview`
  missing its command or output block, is a build error;
- the YAML [frontmatter](frontmatter) block must parse (and be terminated).

## The write–compile–preview loop

Compiling is fast enough to keep in the inner loop: edit a page, re-run
`khb compile`, and re-open the `.khb` in the viewer (drag it onto the window —
re-opening a book replaces the loaded copy). For a quick sanity check without the
viewer, `khb inspect` prints a docset's metadata and table-of-contents summary:

```bash
khb inspect my.khb
```

## From a docset to a website

`compile` builds one book. Assembling a publishable site — a built viewer plus one or
more docsets and their manifest — is the job of [`khb pack`](khb-publishing:pack), and
updating a published site in place is [`khb patch`](khb-publishing:patch); both are
documented in *Publishing KD Help Books*.
