---
title: CI with GitHub Actions
keywords: [CI, GitHub Actions, automation, workflow, deploy, Pages]
categories: [hosting]
related: [hosting, getting-published, pack, versioning]
---

# CI with GitHub Actions

Publishing is a build you can automate: fetch the `khb` CLI and the prebuilt
viewer, compile the book, `pack`, deploy. The workflow below rebuilds a book
repository's site on every push to `main` and deploys it to GitHub Pages.

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
