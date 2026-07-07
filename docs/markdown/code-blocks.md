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

## Groups (tabs)

Wrap several code blocks in a **`~~~code-group … ~~~`** fence (tildes on the outside,
so the inner blocks keep their backticks) to render them as **tabs** — one highlighted
panel per block, its `[label]` (or the language) as the tab. Handy for
npm/pnpm/yarn or the same idea in several languages.

`````md
~~~code-group
```bash [npm]
npm install kdhelp
```
```bash [pnpm]
pnpm add kdhelp
```
```bash [yarn]
yarn add kdhelp
```
~~~
`````

~~~code-group
```bash [npm]
npm install kdhelp
```
```bash [pnpm]
pnpm add kdhelp
```
```bash [yarn]
yarn add kdhelp
```
~~~

A group with no inner code blocks is a **build error** (a likely authoring mistake).

## Command + output (`code-preview`)

A **`~~~code-preview … ~~~`** fence pairs a **command** (first inner block, syntax
highlighted) with its **output** (second block), rendered as a terminal panel. Missing
either block is a build error.

`````md
~~~code-preview
```bash
khb compile docs/markdown -o markdown.khb
```
```
compiled khb-markdown (14 pages, language en) -> markdown.khb
```
~~~
`````

~~~code-preview
```bash
khb compile docs/markdown -o markdown.khb
```
```
compiled khb-markdown (14 pages, language en) -> markdown.khb
```
~~~

## File tree (`code-tree`)

A **`~~~code-tree … ~~~`** fence turns each block's `[path]` label into a **file tree**
(folders nest by `/`) beside the selected file's code — click a file to switch. A tree
with no files is a build error.

`````md
~~~code-tree
```toml [docset.toml]
id = "my-book"
title = "My Book"
```
```md [pages/index.md]
# Home
Welcome.
```
```md [pages/guide/setup.md]
# Setup
Steps…
```
~~~
`````

~~~code-tree
```toml [docset.toml]
id = "my-book"
title = "My Book"
```
```md [pages/index.md]
# Home
Welcome.
```
```md [pages/guide/setup.md]
# Setup
Steps…
```
~~~

## How highlighting works

- The compiler emits **CSS classes** (not inline colours); the viewer injects the
  theme stylesheet into the content frame, so code follows the app theme (a light
  theme today, with a dormant dark theme ready for a future dark mode).
- The search text (`plain`) is taken from an *unhighlighted* render, so token spans
  never pollute full-text search.

## Notes for KD Help Book

- Inline code uses single backticks: `` `let x = 1` ``.
- **Collapsible** blocks (the `collapse` flag) and **groups** (`~~~code-group`) work
  today. A **file-tree** view and code→output **preview** aren't supported yet — they'll
  reuse the same opaque-fence mechanism (see the [overview](overview)).
