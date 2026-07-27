
# Publishing KD Help Books

This volume is for **maintainers and publishers**: you have one or more compiled
`.khb` books (see [Authoring KD Help Books](khb-authoring:index) for how they are
written and compiled) and want readers to open them — on a website, offline, or
straight from a URL.

The whole pipeline is **static**. `khb pack` assembles a self-contained directory —
the KD Help Book Viewer plus your books plus two small JSON files — and any static
file host serves it as-is. No backend, no database, no build step on the server.

## What's in this volume

| Page | Covers |
|------|--------|
| [Getting published](getting-published.md) | a working site in five minutes |
| [pack](pack.md) | assembling a distribution — every flag |
| [patch](patch.md) | updating a built distribution in place |
| [Anatomy of a distribution](distribution.md) | `docsets.json`, `config.json`, and how the viewer reads them |
| [Hosting](hosting.md) | static hosts, GitHub Pages, HTTP `Range`, CORS |
| [CI with GitHub Actions](ci.md) | a copy-paste workflow that builds and deploys the site |
| [Versioning](versioning.md) | shipping several versions of one book side by side |
| [.khbm manifests](khbm-manifests.md) | a fetchable list of docsets readers import in one step |

## Where to go next

- New to publishing? Start with [Getting published](getting-published.md).
- Writing the books themselves? That's the
  [authoring volume](khb-authoring:index).
- Curious what's inside a `.khb`, how streaming works, or building your own
  compiler? See [KD Help Book Internals](khb-internals:index).
