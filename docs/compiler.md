# The `kdhelp` CLI

Build it from the workspace:

```bash
cd compiler
cargo build --release -p kdhelp-cli   # target/release/kdhelp
```

## Authoring a source directory

A source directory produces one docset (one "book"):

```text
docset.toml        # id, title, version, language
categories.yaml    # optional: [{ id, title }, …]
toc.yaml           # optional: nested [{ page, title?, children }, …]
pages/*.md         # pages with YAML frontmatter
```

**`docset.toml`**

```toml
id = "my-docs"
title = "My Documentation"
version = "0.1.0"
language = "en"        # selects the FTS tokenizer
```

**Pages** — Markdown with an optional YAML frontmatter block:

```markdown
---
title: My page          # falls back to the first "# heading", then the file name
keywords: [example, topic]
categories: [basics]
---
# My page

Content in **Markdown** — GFM tables, task lists, strikethrough, autolinks. Link
between pages with `#id`, e.g. [another page](#another-id).
```

`id` defaults to the file name. `keywords` feed the F1 index; `categories` tag the
page for the facet (a category referenced but not declared in `categories.yaml` is
auto-registered).

**`toc.yaml`** — the table-of-contents hierarchy, referencing pages by id:

```yaml
- page: getting-started
  children:
    - page: what-is-khb
- page: reference
```

Order in the file is order in the tree. If `toc.yaml` is omitted, a flat table of
contents in file-name order is produced (numeric filename prefixes such as
`01-intro.md` therefore control ordering).

## Commands

### `compile` — source → docset

```bash
kdhelp compile <src-dir> -o out.khb            # SQLite docset (default)
kdhelp compile <src-dir> -o out.khbb --format khbb
```

### `convert` — `.khb` ⇄ `.khbb`

Direction is inferred from the file extensions:

```bash
kdhelp convert out.khb  -o out.khbb    # down-convert to the binary form
kdhelp convert out.khbb -o out.khb     # rebuild the SQLite docset
```

### `pack` — assemble a publishable distribution

Copies a built viewer, bundles docsets into `docsets/`, and writes `docsets.json`
(metadata read from each docset) and `config.json`.

```bash
kdhelp pack --viewer viewer-ts/dist \
            --docset docs.khb --docset extras.khb \
            --profile reader \
            -o publish/
```

| Flag | Meaning |
|------|---------|
| `--viewer <dir>` | the built viewer to copy |
| `--docset <path>` | a docset to bundle (repeatable) |
| `--mode khb\|compact` | `compact` gzips each docset to `.khbc` |
| `--profile reader\|bundled` | sets external-sources / PWA defaults |
| `--lock` | disable opening/uploading other docsets |
| `--pwa` / `--no-pwa` | force the service worker on/off |
| `-o <dir>` | output directory |

### `patch` — update a built distribution

```bash
kdhelp patch publish/ --docset new.khb    # add or replace, updating docsets.json
```
