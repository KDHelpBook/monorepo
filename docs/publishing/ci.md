---
title: CI with GitHub Actions
keywords: [CI, GitHub Actions, automation, workflow, deploy, Pages, reusable]
categories: [hosting]
related: [hosting, getting-published, pack, versioning]
---

# CI with GitHub Actions

Publishing is a build you can automate: fetch the `khb` CLI and the prebuilt
viewer, compile the book, `pack`, deploy. There are two ways to wire it up — a
**reusable workflow** that does all of that in a few lines, or the **full
workflow** spelled out step by step when you want more control (or another CI).

## The quick way: a reusable workflow

KD Help Book ships a reusable workflow, `book-pages.yml`, that fetches the
toolchain, compiles every book in your repository, packs a bundled site, and
deploys it to *your* repository's GitHub Pages. Your workflow just calls it:

```yaml [.github/workflows/docs.yml]
name: Docs

on:
  push:
    branches: [main]

jobs:
  docs:
    uses: KDHelpBook/monorepo/.github/workflows/book-pages.yml@v1
    permissions:
      contents: read
      pages: write
      id-token: write
    with:
      sources: "."          # dirs with a docset.toml (globs OK, e.g. docs/*)
      home: my-book:index   # cold-start landing page
```

One-time setup: **Settings → Pages → Source → GitHub Actions**. Then every push
to `main` rebuilds and redeploys — no secrets, no boilerplate.

The inputs mirror the [`pack`](pack) flags:

| Input | Default | Meaning |
|-------|---------|---------|
| `version` | `latest` | khb release to build with — pin a tag (`v1.2.0`) for reproducible builds |
| `sources` | `.` | source dirs, whitespace/newline separated; shell globs expand |
| `home` | — | cold-start [landing page](pack-home) id, or `search` |
| `stream` | `true` | mark books for [streaming](pack-stream) |
| `llms` | `true` | emit the [AI export](pack-llms) |
| `base-url` | the Pages URL | override the deploy URL (needs a trailing slash) |
| `extra-pack-args` | — | any extra `pack` flags, e.g. `--mode compact` |

Pin `@v1` for the latest v1.x, or a full `@vX.Y.Z` to lock a specific release.

### PR previews

A companion reusable workflow, `book-pr-preview.yml`, publishes a compiled
preview to `pr-preview/pr-<N>/` for any pull request carrying a `preview` label,
and tears it down when the label is removed or the PR closes:

```yaml [.github/workflows/pr-preview.yml]
on:
  pull_request:
    types: [opened, reopened, labeled, unlabeled, synchronize, closed]

jobs:
  preview:
    uses: KDHelpBook/monorepo/.github/workflows/book-pr-preview.yml@v1
    permissions:
      contents: write
      pull-requests: write
    with:
      home: my-book:index
```

One-time setup for previews: **Settings → Pages → Source → Deploy from a branch
→ gh-pages**.

## The full workflow

When you want full control — a different host, extra build steps, or another CI
system — spell it out. This is exactly what the reusable workflow runs under the
hood (and the fetch-the-toolchain step is what the `setup-khb` action wraps):

```yaml [.github/workflows/publish-book.yml]
name: Publish the book

on:
  push:
    branches: [main]

# Deploying to Pages needs these two; contents stays read-only.
permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      # The khb CLI binary and the prebuilt viewer, from the latest
      # KD Help Book release.
      - name: Fetch khb and the viewer
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh release download --repo KDHelpBook/monorepo \
            --pattern 'khb-v*-x86_64-unknown-linux-gnu.tar.gz' \
            --pattern 'khb-viewer-*.tar.gz'
          tar xzf khb-v*-x86_64-unknown-linux-gnu.tar.gz --strip-components=1
          mkdir viewer && tar xzf khb-viewer-*.tar.gz -C viewer --strip-components=1

      # Compile the book (this repository is the source folder) and
      # assemble the site.
      - name: Compile and pack
        run: |
          ./khb compile . -o book.khb
          ./khb pack --viewer viewer \
            --docset book.khb \
            --profile bundled \
            --home my-book:index \
            -o publish

      - uses: actions/configure-pages@v6
      - uses: actions/upload-pages-artifact@v5
        with:
          path: publish

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
```

Adjust three things for your repository: the source path in `khb compile` (here the
repo root *is* the book), the [`--home`](pack-home) page id, and any extra
[`pack` flags](pack) you publish with (`--stream`, `--llms`, more `--docset`s).
One-time setup: the repository's **Settings → Pages → Source** must be set to
*GitHub Actions*.

## Notes

- **Pin the tools for reproducible builds.** `gh release download` without a tag
  takes the *latest* KD Help Book release; pass a tag (`gh release download
  v1.2.0 …`) to pin, and bump it deliberately.
- **Several books?** Compile each source folder and pass several `--docset` flags
  to one `pack` call.
- **Shipping old versions side by side?** Keep each release's compiled `.khb` (a
  release asset works well) and [`patch`](patch) them into the freshly packed site —
  the pattern is described in [Versioning](versioning).
- The result is a plain static directory — everything on the [Hosting](hosting)
  page applies to it, whatever CI system you use; GitHub Actions is just the worked
  example.
