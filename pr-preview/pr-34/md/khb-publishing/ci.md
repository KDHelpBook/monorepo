
# CI with GitHub Actions

Publishing is a build you can automate: fetch the `khb` CLI and the prebuilt
viewer, compile the book, `pack`, deploy. There are three ways to wire it up,
trading brevity for control: a **reusable workflow** that does it all in a few
lines, the **composite actions** it's built from when you want your own job, or
the **full workflow** spelled out step by step (handy for other CI systems).

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

The inputs mirror the [`pack`](pack.md) flags:

| Input | Default | Meaning |
|-------|---------|---------|
| `version` | `latest` | khb release to build with — pin a tag (`v1.2.0`) for reproducible builds |
| `sources` | `.` | source dirs, whitespace/newline separated; shell globs expand |
| `home` | — | cold-start [landing page](pack-home.md) id, or `search` |
| `stream` | `true` | mark books for [streaming](pack-stream.md) |
| `llms` | `true` | emit the [AI export](pack-llms.md) |
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

## The building blocks: setup-khb + build-book

The reusable workflows are thin wrappers over two composite actions. Reach for
the actions directly when you want your own job — custom triggers, extra steps,
a deploy target that isn't GitHub Pages — without re-deriving the
compile-and-pack dance.

**`setup-khb`** downloads the khb CLI (and, by default, the prebuilt viewer)
from a release and puts `khb` on `PATH`:

| Input | Default | Meaning |
|-------|---------|---------|
| `version` | `latest` | release to fetch — a tag (`vX.Y.Z`) or `latest` |
| `viewer` | `true` | also download the prebuilt viewer |
| `repository` | `KDHelpBook/monorepo` | where to fetch the release from |

Outputs: `khb` (binary path, also added to `PATH`), `viewer-dir`, and `version`
(the concrete tag fetched — a real `vX.Y.Z` even when you asked for `latest`).

**`build-book`** compiles every source directory that has a `docset.toml` (globs
expand, so `docs/*` picks up each volume) and packs a distribution:

| Input | Default | Meaning |
|-------|---------|---------|
| `viewer-dir` | *(required)* | prebuilt viewer — e.g. `setup-khb`'s `viewer-dir` output |
| `khb` | `khb` | binary path; defaults to the one `setup-khb` put on `PATH` |
| `sources` | `.` | source dirs, whitespace/newline separated; shell globs expand |
| `out` | `publish` | output distribution directory |
| `profile` | `bundled` | `reader` or `bundled` (see [Profiles](pack-profiles.md)) |
| `home` | — | cold-start [landing page](pack-home.md) id or `search` |
| `base-url` | — | absolute deploy URL (trailing slash); with `llms`, writes sitemap + robots |
| `stream` | `true` | mark books for [streaming](pack-stream.md) |
| `llms` | `true` | emit the [AI export](pack-llms.md) |
| `allow-extensions` | `false` | run each docset's `[extensions]` transformers |
| `extra-pack-args` | — | appended verbatim to `khb pack` |

Output: `dist`, the packed directory. A custom job wiring the two together, then
deploying however you like:

```yaml [.github/workflows/docs.yml]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: KDHelpBook/monorepo/.github/actions/setup-khb@v1
        id: khb
        with:
          version: v1.2.0 # pin a tag for reproducible builds
      - uses: KDHelpBook/monorepo/.github/actions/build-book@v1
        with:
          viewer-dir: ${{ steps.khb.outputs.viewer-dir }}
          sources: docs/*
          home: my-book:index
      # …then deploy the `publish/` directory to any static host.
```

Both actions run on Linux and macOS runners.

## The full workflow

When you'd rather not depend on the actions at all — another CI system, or the
most explicit possible pipeline — call the CLI directly. This is what
`setup-khb` and `build-book` do under the hood:

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
repo root *is* the book), the [`--home`](pack-home.md) page id, and any extra
[`pack` flags](pack.md) you publish with (`--stream`, `--llms`, more `--docset`s).
One-time setup: the repository's **Settings → Pages → Source** must be set to
*GitHub Actions*.

## Notes

- **Pin the tools for reproducible builds.** `gh release download` without a tag
  takes the *latest* KD Help Book release; pass a tag (`gh release download
  v1.2.0 …`) to pin, and bump it deliberately.
- **Several books?** Compile each source folder and pass several `--docset` flags
  to one `pack` call.
- **Shipping old versions side by side?** Keep each release's compiled `.khb` (a
  release asset works well) and [`patch`](patch.md) them into the freshly packed site —
  the pattern is described in [Versioning](versioning.md).
- The result is a plain static directory — everything on the [Hosting](hosting.md)
  page applies to it, whatever CI system you use; GitHub Actions is just the worked
  example.
