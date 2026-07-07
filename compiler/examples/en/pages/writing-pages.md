---
title: Writing pages
keywords: [Markdown, frontmatter, pages, authoring]
categories: [authoring]
---
# Writing pages

Each page is a Markdown file with a small YAML **frontmatter** block:

```yaml
---
title: My page
keywords: [example, topic]
categories: [authoring]
---
# My page

Content in **Markdown**…
```

The `id` defaults to the file name; `title` falls back to the first `# heading`.
`keywords` feed the index and `categories` tag the page for the facet.

## Markdown features

Standard Markdown plus tables, task lists, strikethrough and autolinks are
supported. A fenced code block is highlighted; add `[filename]` after the language to
label it, and every block gets a copy button:

```rust [hello.rs]
fn main() {
    println!("Hello from a docset!");
}
```

Link between pages by their id, e.g. [Categories](categories); use `#heading` for an
in-page section anchor.

> [!NOTE]
> Use `> [!NOTE]` (or `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`) to set text apart in a
> coloured callout.

> [!WARNING]
> A category referenced here but missing from `categories.yaml` is auto-registered.
