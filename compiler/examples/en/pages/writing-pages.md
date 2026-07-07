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

For a step-by-step screenshot strip, a `~~~gallery` fence lays the images out as
uniform captioned tiles — the image's alt text is the caption, and any line after it is
the tile's description:

~~~gallery w=180 scroll
![1. Waiting for the card](assets/step-wait.svg)
Tap the card — its **UID** appears.

![2. Scanning](assets/step-scan.svg)
Exactly **one** tag may answer.

![3. Write confirmed](assets/step-done.svg)
~~~

> [!NOTE]
> Use `> [!NOTE]` (or `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`) to set text apart in a
> coloured callout.

> [!WARNING]
> A category referenced here but missing from `categories.yaml` is auto-registered.
