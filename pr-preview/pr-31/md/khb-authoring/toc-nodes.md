
# TOC nodes

A [toc.yaml](toc-yaml.md) is a nested list of two node kinds.

## Page nodes

```yaml
- page: getting-started
```

A `page:` node puts the page in the tree; its label defaults to the page's
[title](frontmatter-title.md). Add a `title:` to **override the label** in the tree
only — the page itself keeps its own title everywhere else:

```yaml
- page: reference-b
  title: The B parts
```

## Folder nodes

```yaml
- title: Reference
  children:
    - page: reference-a
    - page: reference-b
```

A node with a `title:` and **no `page:`** is a **folder node**: it only groups its
children — in the viewer it expands and collapses but cannot be opened as a page. A
folder node without a `title:` fails the [compile](compiling.md).

## Nesting

Either kind may carry `children:`, to any depth — so a section can be an openable
page *with* subpages (a landing page node with children) or a pure grouping (a folder
node).

```yaml
- page: frontmatter        # a landing page with subpages
  children:
    - page: frontmatter-id
    - page: frontmatter-title
- title: Appendices        # a pure grouping
  children:
    - page: glossary
```
