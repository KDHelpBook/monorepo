# The `khb` CLI

Build it from the workspace:

```bash
cd compiler
cargo build --release -p khb-cli   # target/release/khb
```

## Authoring a source directory

A source directory produces one docset (one "book"):

```text
docset.toml        # id, title, version, language
categories.yaml    # optional: [{ id, title }, …]
toc.yaml           # optional: nested [{ page, title?, children }, …]
pages/*.md         # pages with YAML frontmatter
assets/*           # optional: images & downloadable files (any depth)
```

**`docset.toml`**

```toml
id = "my-docs"
title = "My Documentation"
version = "0.1.0"
language = "en"                 # selects the FTS tokenizer
collection = "my-product"       # optional: merge/family key (default = id)
collection_title = "My Product" # optional: family display title (default = title)

# optional: products this book belongs to (a many-to-many filter facet, separate
# from `collection`). A book may list several; omit it and the book is filed under
# one product named after its `collection`.
[[products]]
id = "my-product"
title = "My Product"
[[products]]
id = "suite"
title = "The Suite"
```

`collection` is the **merge/family key**: books sharing one merge seamlessly under a
single top-level folder in the viewer's table of contents, and it's also how a book's
language/version editions pair up. `products` is a separate **filter facet** — the
viewer's *Filter by product* scope — that is **many-to-many**: one book can belong to
several products, and one product can span several families. (See
[collections.md](collections.md).) Omit `products` and the book defaults to a single
product named after its `collection`, so the scope keeps working.

**Pages** — Markdown with an optional YAML frontmatter block:

```markdown
---
title: My page          # falls back to the first "# heading", then the file name
keywords: [example, topic]
categories: [basics]                     # a page may be in several categories
related: [another-id, other-book:page]   # "See also" links
---
# My page

Content in **Markdown** — GFM tables, task lists, strikethrough, autolinks. Link
between pages with `#id`, e.g. [another page](#another-id).
```

A fenced code block that declares a language (```` ```rust ````, ```` ```bash ````,
`…`) is **syntax-highlighted at compile time** (comrak + syntect). The highlighting is
emitted as **CSS classes** (not inline styles), so the colours come from a stylesheet
the viewer injects into the content frame — which lets code blocks follow the app
theme (a light theme by default, with a dormant `[data-theme="dark"]` block ready for
dark mode) instead of one theme being baked into every `.khb`. The theme CSS is
generated from syntect so it always matches the emitted classes; regenerate it with
`cargo run -p khb-core --example syntax-css > viewer-ts/src/styles/syntax.css`. The
search text (`plain`) is taken from an unhighlighted render, so the per-token spans
never leak into full-text search.

`id` defaults to the file name. `keywords` feed the F1 index; `categories` tag the
page for the facet (many-to-many — a page can be in several; a category referenced
but not declared in `categories.yaml` is auto-registered). `related` renders a
**"See also"** footer: each entry is a page id in this book, or a
`docsetId:localId` for a cross-book link. Within-book ids are validated at compile
time; cross-book ids are stored as-is and the viewer hides any whose book is not
loaded.

**`toc.yaml`** — the table-of-contents hierarchy, referencing pages by id. A node
may instead omit `page:` and give just a `title:` — a **folder node**
that only groups its children and cannot be opened:

```yaml
- page: getting-started
  children:
    - page: what-is-khb
- title: Reference          # folder node — no page, expand/collapse only
  children:
    - page: reference-a
    - page: reference-b
```

A `page:` node's label defaults to the page title (`title:` overrides it); a folder
node must have a `title:` — compiling fails otherwise. Order in the file is order in
the tree. If `toc.yaml` is omitted, a flat table of contents in file-name order is
produced (numeric filename prefixes such as `01-intro.md` therefore control
ordering).

**Attachments** — drop images and downloadable files under `assets/` (any depth)
and reference them from Markdown by their `assets/…` path:

```markdown
![architecture](assets/diagram.svg)
[Download the sample](assets/sample.zip)
```

Every file under `assets/` is stored (so downloadable attachments need not be
inline-referenced). Images render inline in the viewer; other types become download
links. By default attachments are embedded in the `.khb`; `--assets sidecar` puts
them in a sibling `.khba` instead (see below).

## Commands

### `compile` — source → docset

```bash
khb compile <src-dir> -o out.khb            # SQLite docset (default)
khb compile <src-dir> -o out.khbb --format khbb
khb compile <src-dir> -o out.khb --assets sidecar   # attachments -> out.khba
```

`--assets embed` (default) stores attachments inside the `.khb`; `--assets sidecar`
writes them to a sibling `out.khba` and leaves the `.khb` lean. A docset may be
backed by several `.khba` packs — `pack`/`patch` pick up `out.khba` and any
`out.<tag>.khba` next to the `.khb`.

### `convert` — `.khb` ⇄ `.khbb`

Direction is inferred from the file extensions:

```bash
khb convert out.khb  -o out.khbb    # down-convert to the binary form
khb convert out.khbb -o out.khb     # rebuild the SQLite docset
```

### `pack` — assemble a publishable distribution

Copies a built viewer, bundles docsets into `docsets/`, and writes `docsets.json`
(metadata read from each docset) and `config.json`. For each `foo.khb` it also
copies any sibling attachment packs (`foo.khba`, `foo.<tag>.khba`) and records them
in the docset's `attachments` array.

```bash
khb pack --viewer viewer-ts/dist \
            --docset docs.khb --docset extras.khb \
            --profile reader \
            -o publish/
```

| Flag | Meaning |
|------|---------|
| `--viewer <dir>` | the built viewer to copy |
| `--docset <path>` | a docset to bundle (repeatable) |
| `--mode khb\|compact` | `compact` gzips every shipped file (docset **and** its `.khba` packs) to `<name>.gz` |
| `--profile reader\|bundled` | sets external-sources / PWA defaults (`bundled` = locked) |
| `--lock` | lock the build: no docset management at all — hides *Open docset…*, *Open from URL…* and the whole **Manage docsets** page, and skips loading any uploaded/remote docsets or attachment packs (`config.externalSources: false`). Docsets are read-only either way; this removes the reader's ability to add/remove/attach them. |
| `--pwa` / `--no-pwa` | force the service worker on/off |
| `--home <id\|search>` | cold-start landing: a page id (`docsetId:localId`) or `search`; omitted → the viewer opens the Search page (search-first) |
| `--llms` | also emit an AI-facing export (see below) |
| `--stream [<path>…]` | mark docset(s) for **page-level streaming**: writes `"streaming": true` into their `docsets.json` entries, so the viewer opens them over HTTP `Range` instead of downloading the whole file (worth it for big books; the host must honour `Range`, else the viewer auto-falls back to a whole fetch). Bare `--stream` marks every docset; `--stream <path>` (repeatable) marks only the named `--docset`s. Streamed files (and their packs) are shipped **uncompressed** even under `--mode compact` — `Range` addresses raw SQLite pages |
| `-o <dir>` | output directory |

#### `--llms` — an AI-facing export

`--llms` writes, alongside the viewer, the [`llms.txt`](https://llmstxt.org/) family
so language models and agents can read the docs without scraping the SPA:

- **`llms.txt`** — a link index: an `H1` title, a one-line summary, then one section
  per book listing every page as `- [title](md/…): description` in TOC order.
- **`llms-full.txt`** — every page's Markdown inline (with provenance comments), for
  one-shot ingestion.
- **`md/<docset>/<page>.md`** — each page as clean Markdown, fetchable on its own.

The Markdown is the page's original source (the optional `pages.md` column, format
v5), falling back to plain text for a docset that carries none. It's the **static**
counterpart to a future MCP server: plain files a static host serves as-is, no
backend. Nothing here is loaded by the viewer.

### `patch` — update a built distribution

```bash
khb patch publish/ --docset new.khb    # add or replace, updating docsets.json
```

`patch` accepts `--mode` and `--stream` like `pack`, applied to the docsets being
added/replaced (existing entries are untouched).

### `inspect` — print a docset's metadata

`src` is a local `.khb` path **or** an `http(s)://` URL. A remote docset is
**streamed** over HTTP `Range` (via the native Range-VFS — see
[streaming.md](streaming.md)), so only the pages read are fetched; the command
reports how little it downloaded.

```bash
khb inspect out.khb
khb inspect https://example.com/docs/en.khb    # streamed; needs a Range-capable host
```
