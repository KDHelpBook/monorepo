---
title: Code blocks
keywords: [code, fenced, syntax highlighting, syntect, language]
categories: [blocks]
related: [text-formatting, images-and-assets]
---

# Code blocks

Fence a block with triple backticks. Declare a **language** after the opening fence to
get **syntax highlighting**, applied *at compile time* by comrak + syntect.

````md
```rust
fn main() {
    println!("Hello from a docset!");
}
```
````

Renders (highlighted):

```rust
fn main() {
    println!("Hello from a docset!");
}
```

A fence **without** a language renders as plain monospace text.

## How highlighting works

- The compiler emits **CSS classes** (not inline colours); the viewer injects the
  theme stylesheet into the content frame, so code follows the app theme (a light
  theme today, with a dormant dark theme ready for a future dark mode).
- The search text (`plain`) is taken from an *unhighlighted* render, so token spans
  never pollute full-text search.

## Notes for kdhelp

- Inline code uses single backticks: `` `let x = 1` ``.
- Docus-style extras — a **filename** tag (` ```ts [file.ts] `), a **copy** button,
  and `::code-group` **tabs** — are **not** supported yet; they're on the roadmap in
  the [overview](#overview) (filename/copy are cheap; tabs would use a directive).
