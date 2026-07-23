
# TOC ordering

## With a toc.yaml

Order in the file **is** order in the tree — top to bottom, at every level. Reorder
the nodes, recompile, done.

## Without a toc.yaml

If the book has no [toc.yaml](toc-yaml.md), the compiler produces a **flat** table of
contents in **file-name order**. Numeric filename prefixes are the idiomatic way to
control it:

```text
01-intro.md
02-setup.md
03-usage.md
10-reference.md
```

> [!WARNING]
> The prefix becomes part of the page id (`01-intro.md` → id `01-intro`) unless the
> page sets an explicit [`id`](frontmatter-id.md) in its frontmatter. If the book might
> ever grow a `toc.yaml` — or be linked into from other books — set clean ids from
> the start, so renumbering files never breaks links.

## Choosing

The flat fallback suits a handful of pages; the moment a book wants sections,
subpages or label overrides, add a `toc.yaml` — the [nodes](toc-nodes.md) page covers
the syntax.
