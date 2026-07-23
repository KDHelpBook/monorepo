
# categories (frontmatter)

Facet tags for the page. Categories are **independent of the TOC hierarchy** — a
many-to-many tagging layer over it.

## Syntax

```yaml
categories: [basics, api]
```

## Default

None — the page is untagged and appears only under the unfiltered view.

## Display titles — `categories.yaml`

A category used in frontmatter but not declared anywhere is **auto-registered** with
its id as its title. To give categories proper display titles, declare them in an
optional `categories.yaml` next to `docset.toml`:

```yaml [categories.yaml]
- id: basics
  title: The Basics
- id: api
  title: API Reference
```

## In the viewer

The **Filter by category** selector prunes the table of contents to the pages tagged
with the chosen category — keeping the folder structure, not flattening it. The facet
unions across loaded books and composes with the
[product filter](docset-products.md).
