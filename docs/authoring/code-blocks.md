---
title: Code blocks
keywords: [code, fenced, syntax highlighting, language, monospace]
categories: [markdown]
related: [code-extensions, text-formatting, differences]
---

# Code blocks

Fence a block with triple backticks. Declare a **language** after the opening fence
and the block is **syntax-highlighted** — at compile time, with nothing to configure;
the colours follow the viewer's theme automatically.

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

## Beyond plain fences

A fence can carry more than a language: a `[filename]` header bar, a **Copy** button,
`collapse`/`open` flags, and multi-block containers — tab **groups**, command+output
**previews**, and **file trees**. Those are KD Help Book additions, documented in
[Code extensions](code-extensions).
