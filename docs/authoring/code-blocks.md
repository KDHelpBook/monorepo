---
title: Code blocks
keywords: [code, fenced, syntax highlighting, language, monospace, syntect]
categories: [markdown]
related: [code-extensions, text-formatting, differences]
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

A fence **without** a language renders as plain monospace text. Inline code uses
single backticks: `` `let x = 1` ``.

## How highlighting works

- The compiler emits **CSS classes** (not inline colours); the viewer injects the
  theme stylesheet into the content frame, so code follows the app theme (a light
  theme today, with a dormant dark theme ready for a future dark mode).
- The search text (`plain`) is taken from an *unhighlighted* render, so token spans
  never pollute full-text search.
- Highlighting happens once, at build time — the viewer ships no highlighter and
  pages render instantly.

## Beyond plain fences

A fence can carry more than a language: a `[filename]` header bar, a **Copy** button,
`collapse`/`open` flags, and multi-block containers — tab **groups**, command+output
**previews**, and **file trees**. Those are KD Help Book additions, documented in
[Code extensions](code-extensions).
