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

## Filename + copy

Add `[filename]` after the language to label the block with a header bar, and every
code block gets a **Copy** button (revealed on hover; always shown on touch).

````md
```ts [nuxt.config.ts]
export default defineConfig({})
```
````

## How highlighting works

- The compiler emits **CSS classes** (not inline colours); the viewer injects the
  theme stylesheet into the content frame, so code follows the app theme (a light
  theme today, with a dormant dark theme ready for a future dark mode).
- The search text (`plain`) is taken from an *unhighlighted* render, so token spans
  never pollute full-text search.

## Notes for kdhelp

- Inline code uses single backticks: `` `let x = 1` ``.
- Grouping code blocks into **tabs** (`::code-group`), a collapsible block, and a
  file-tree view are **not** supported yet — they'll use a directive renderer (see the
  [overview](overview)).
