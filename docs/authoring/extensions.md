---
title: Extensions
keywords: [extension, ext, preprocessor, external, subprocess, transform, plugin]
categories: [configuration]
related: [docset-toml, code-blocks, diagrams, images]
---

# Extensions

An **extension** hands the body of a fenced block to an **external program** that turns it
into other Markdown — and, optionally, generated image files. The compiler splices the
returned Markdown back into the page (rendering it like any other Markdown) and stores any
images the program produced as [assets](images).

It's the escape hatch for content the bundled compiler can't produce on its own: compile a
domain-specific snippet into an example plus a rendered visualization, turn a data file into
a table, shell out to a real diagram engine, and so on.

> [!NOTE]
> Extensions run **external processes**, so they're **off by default**. The compiler only
> runs them when you pass `--allow-extensions`, and only the ones a book declares in its
> `docset.toml`. A book that uses extensions still compiles without the flag — its `ext:`
> blocks are just left as plain code blocks. See [Running](#running) below.

## A motivating example

Say a `khb-label` tool compiles a label definition into a preview. In a page you write an
` ```ext:label ` block:

````md
```ext:label
name: Fragile
color: red
```
````

With extensions enabled, `khb-label` receives that body and returns Markdown — e.g. the
source shown as a code sample followed by `![preview](assets/ext/label/…/out.svg)` — and the
generated `out.svg` is embedded in the book. Readers see the example and its visualization;
without the flag, they just see the label source as a code block.

## Declaring an extension

Add an `[extensions.<name>]` table to [`docset.toml`](docset-toml). The `<name>` is what the
` ```ext:<name> ` fence refers to:

```toml [docset.toml]
[extensions.label]
command = "khb-label"          # bare name → looked up on PATH
args    = ["--theme", "dark"]  # optional fixed arguments, passed every run
```

- **`command`** — the executable to run. A **bare name** (`khb-label`) is resolved on your
  `PATH`. A **path** (`./tools/label`, `bin/label`) is resolved relative to the source folder,
  so a book can ship its own tool.
- **`args`** — optional fixed arguments passed on every invocation (also handed to the tool
  in the request, see [the protocol](#the-protocol)).

A `<name>` must be non-empty and contain no `:` or whitespace.

## The `ext:` block

Trigger an extension with a fenced code block whose language is `ext:` + the declared name.
Anything after the name on the info line is passed to the tool as its `meta` string:

````md
```ext:label --variant compact
name: Fragile
```
````

Here `label` selects the extension and `--variant compact` arrives as `meta`. The `ext:`
prefix keeps these blocks from ever colliding with a real language or a built-in block like
` ```dot `.

## Running

Extension processes only run when you compile with the opt-in flag:

```bash
khb compile my-docs -o my-docs.khb --allow-extensions
```

Why opt-in: a `docset.toml` may come from an untrusted source, and running its declared
commands is arbitrary code execution. The flag keeps the default build **hermetic and
offline** — the same reason the bundled compiler avoids browser-based tools (see the note in
[Diagrams](diagrams)). Compiling *without* the flag is always safe: each `ext:` block is left
as a plain code block and a note is printed, so the book still builds.

When the flag *is* set, an `ext:<name>` block whose `<name>` isn't declared is a build error
(it's almost always a typo).

## The protocol

An extension is any executable that speaks this JSON-over-stdio contract.

**Request** — the compiler writes one JSON object to the tool's **stdin**:

```json
{
  "khb_extension_protocol": 1,
  "lang": "label",
  "meta": "--variant compact",
  "args": ["--theme", "dark"],
  "body": "name: Fragile\n",
  "page_id": "intro",
  "assets_dir": "/tmp/khb-ext-1234-0",
  "asset_prefix": "assets/ext/label/intro/0/"
}
```

- `body` — the verbatim block body (no fences).
- `meta` — the info-line text after the name; `args` — the `docset.toml` arguments.
- `assets_dir` — a scratch directory the tool may write generated files into.
- `asset_prefix` — the path prefix to reference those files by in the returned Markdown.

The same values are also exposed as environment variables `KHB_EXTENSION=1`, `KHB_PAGE_ID`,
and `KHB_LANG`, and the process runs with the source folder as its working directory.

**Response** — the tool writes one JSON object to **stdout**:

```json
{
  "markdown": "```\nname: Fragile\n```\n\n![preview](assets/ext/label/intro/0/out.svg)\n",
  "assets": [ { "file": "out.svg" } ]
}
```

- `markdown` — replaces the block. It is rendered to HTML like ordinary page Markdown.
- `assets` — files the tool wrote into `assets_dir`, each by a **bare filename** (no `/`,
  `\`, or `..`). Each is stored in the book and can be referenced from `markdown` as
  `asset_prefix` + the filename.

A generated file at `assets_dir/out.svg` becomes the asset
`assets/ext/<name>/<page>/<n>/out.svg` — a namespace that can't clash with your own
`assets/` files or with other blocks. Reference it in the returned Markdown exactly as
`asset_prefix` + `out.svg`, and it resolves like any other image.

## Errors

A tool that **exits non-zero**, writes **unparseable JSON**, or names an **unsafe asset
filename** fails the build, with the page, the extension name, and the tool's stderr in the
message — the same "a broken block is a build error, not a blank space" policy as
[diagrams](diagrams) and [math](math).

## Notes and limits

- **Determinism** — a build is only as reproducible and offline as the tools it runs. Keep
  extensions deterministic; treat them as part of your toolchain.
- **Nested blocks** — the Markdown a tool returns is rendered on its own, so it won't re-run
  *other* extensions or expand built-in widgets like ` ```dot ` inside it (the same limit as
  galleries and code-preview blocks). Emit the final form directly.
- **Windows** — `command` must be an executable; to run a `.bat`/`.cmd` or a script, point
  `command` at the interpreter and pass the script through `args`.
- **AI text** — the clean-Markdown copy used by the [AI export](khb-publishing:pack-llms)
  keeps the original `ext:` source, not the expanded output.
