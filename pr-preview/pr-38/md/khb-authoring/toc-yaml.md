
# toc.yaml

An optional file next to `docset.toml` that defines the book's table-of-contents
tree, referencing pages by [id](frontmatter-id.md):

```yaml [toc.yaml]
- page: getting-started
  children:
    - page: what-is-khb
- title: Reference          # folder node — groups its children, can't be opened
  children:
    - page: reference-a
    - page: reference-b
      title: The B parts    # label override for this node only
```

Two node kinds — **page nodes** (`page:`) and **folder nodes** (`title:` only) — may
nest freely via `children:`; order in the file is order in the tree. Every `page:`
id must name an existing page, and every folder node needs a `title:` — either
mistake fails the [compile](compiling.md). Without a `toc.yaml` the book gets a flat
table of contents in file-name order.

The tree only *arranges* pages: a page absent from `toc.yaml` still compiles, is
searchable and linkable — it just has no Contents entry.

## In this section

| Page | Covers |
|------|--------|
| [TOC nodes](toc-nodes.md) | page nodes, label overrides, folder nodes |
| [TOC ordering](toc-ordering.md) | ordering with and without a `toc.yaml` |
