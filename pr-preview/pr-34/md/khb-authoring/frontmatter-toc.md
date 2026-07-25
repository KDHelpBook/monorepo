
# toc (frontmatter)

Forces the page's **"On this page"** box — the section navigation built from the
page's headings — on or off.

## Syntax

```yaml
toc: false
```

## Default

Omitted → **automatic**: the box is shown only when the page has two or more
top-level sections (`##` headings), and skipped for short single-section pages.

## Example

A long reference page with one giant section can still opt in:

```yaml
toc: true
```

## In the viewer

The box renders at the top of the page and deep-links each entry to its
[heading anchor](headings.md). `toc: true` shows it regardless of section count;
`toc: false` suppresses it even on a heading-rich page (say, a glossary where the box
would just duplicate the content).
