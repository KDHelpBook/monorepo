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

## Collapsible blocks

Add the **`collapse`** flag after the language (and optional `[filename]`) to clamp a
long block to a short **preview** — the first few lines stay visible and fade out under
an *Expand code* / *Collapse code* button. Collapsed by default; add **`open`** to start
expanded.

````md
```rust [main.rs] collapse
fn main() {
    let mut total = 0;
    for i in 1..=10 {
        total += i;
        println!("running total after {i}: {total}");
    }
    println!("sum 1..=10 = {total}");
    // …plus a long tail of code you'd rather tuck away until it's wanted.
}
```
````

```rust [main.rs] collapse
fn main() {
    let mut total = 0;
    for i in 1..=10 {
        total += i;
        println!("running total after {i}: {total}");
    }
    println!("sum 1..=10 = {total}");
    // …plus a long tail of code you'd rather tuck away until it's wanted.
}
```

## How highlighting works

- The compiler emits **CSS classes** (not inline colours); the viewer injects the
  theme stylesheet into the content frame, so code follows the app theme (a light
  theme today, with a dormant dark theme ready for a future dark mode).
- The search text (`plain`) is taken from an *unhighlighted* render, so token spans
  never pollute full-text search.

## Notes for kdhelp

- Inline code uses single backticks: `` `let x = 1` ``.
- **Collapsible** blocks work today (the `collapse` flag above). Grouping code blocks
  into **tabs** and a **file-tree** view aren't supported yet — those need a container,
  so they'll use an opaque `~~~code-group … ~~~` fence we post-process (see the
  [overview](overview)).
