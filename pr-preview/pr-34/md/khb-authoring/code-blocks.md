
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

KD Help Book extends plain fences two ways: **flags on the fence info string**
(filename, collapse) and **`~~~` containers** that combine several blocks into one
widget (tabs, command+output, file trees). No raw HTML, no directive syntax — just
fences. These are the only container blocks; there is no generic `:::` directive
syntax — see [Differences from GitHub Markdown](differences.md).

### Filename + copy

Add `[filename]` after the language to label the block with a header bar, and every
code block gets a **Copy** button (revealed on hover; always shown on touch).

````md
```ts [nuxt.config.ts]
export default defineConfig({})
```
````

### Highlight lines

Add a **`{2,4-6}`** range after the language (and optional `[filename]`) to tint specific
lines — single numbers and `start-end` ranges, comma-separated, 1-based.

````md
```rust {2,4-5}
fn main() {
    let base = 10;          // highlighted
    let mut total = 0;
    for i in 1..=base {     // highlighted
        total += i;         // highlighted
    }
}
```
````

```rust {2,4-5}
fn main() {
    let base = 10;          // highlighted
    let mut total = 0;
    for i in 1..=base {     // highlighted
        total += i;         // highlighted
    }
}
```

### Collapsible blocks

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

### Groups (tabs)

Wrap several code blocks in a **`~~~code-group … ~~~`** fence (tildes on the outside,
so the inner blocks keep their backticks) to render them as **tabs** — one highlighted
panel per block, its `[label]` (or the language) as the tab. Handy for
npm/pnpm/yarn or the same idea in several languages.

`````md
~~~code-group
```bash [npm]
npm install khb
```
```bash [pnpm]
pnpm add khb
```
```bash [yarn]
yarn add khb
```
~~~
`````

~~~code-group
```bash [npm]
npm install khb
```
```bash [pnpm]
pnpm add khb
```
```bash [yarn]
yarn add khb
```
~~~

A group with no inner code blocks is a **build error** (a likely authoring mistake).
These malformed-container errors are part of [compile-time validation](compiling.md) —
an empty group or a preview missing its output block never ships.

### Command + output (`code-preview`)

A **`~~~code-preview … ~~~`** fence pairs a **command** (first inner block, syntax
highlighted) with its **output** (second block), rendered as a terminal panel. Missing
either block is a build error.

`````md
~~~code-preview
```bash
khb compile docs/authoring -o authoring.khb
```
```
compiled khb-authoring (36 pages, language en) -> authoring.khb
```
~~~
`````

~~~code-preview
```bash
khb compile docs/authoring -o authoring.khb
```
```
compiled khb-authoring (36 pages, language en) -> authoring.khb
```
~~~

That terminal panel is the **default skin**. Add a skin token to change how the second
block renders — see `example` below.

### Source + rendered result (`example` skin)

`~~~code-preview example` pairs a construct's **source** (first block, shown as code) with
its **rendered result** (second block, rendered as Markdown) — for showing syntax next to
what it produces, in one connected frame. Both blocks are still required, and given
separately, so the result needn't be the literal render of the source.

`````md
~~~code-preview example
```md
> [!TIP]
> Name files after their page ids.
```
```md
> [!TIP]
> Name files after their page ids.
```
~~~
`````

~~~code-preview example
```md
> [!TIP]
> Name files after their page ids.
```
```md
> [!TIP]
> Name files after their page ids.
```
~~~

Add **`split`** (`~~~code-preview example split`) to place source and result side by side;
it falls back to stacked on a narrow pane.

~~~code-preview example split
```md
**Bold**, ==highlight==, and `inline code`.
```
```md
**Bold**, ==highlight==, and `inline code`.
```
~~~

> [!TIP]
> Writing the snippet twice gets tedious. This guide writes it **once** with the
> [`ext:example`](extensions.md) extension — the tool emits this widget for you (compile the
> book with `--allow-extensions`).

### File tree (`code-tree`)

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
