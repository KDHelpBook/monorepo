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
supported. Fenced code blocks render with monospace styling:

```rust
fn main() {
    println!("Hello from a docset!");
}
```

Link between pages with `#id`, for example [Categories](#categories).
