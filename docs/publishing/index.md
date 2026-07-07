---
title: Publishing KD Help Books
keywords: [publishing, distribution, pack, hosting, static site, overview]
categories: [publishing]
related: [getting-published, pack, khb-authoring:index, khb-internals:index]
---

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
| [Getting published](getting-published) | a working site in five minutes |
| [pack](pack) | assembling a distribution — every flag |
| [patch](patch) | updating a built distribution in place |
| [Anatomy of a distribution](distribution) | `docsets.json`, `config.json`, and how the viewer reads them |
| [Hosting](hosting) | static hosts, GitHub Pages, HTTP `Range`, CORS |
| [Versioning](versioning) | shipping several versions of one book side by side |
| [.khbm manifests](khbm-manifests) | a fetchable list of docsets readers import in one step |

## Where to go next

- New to publishing? Start with [Getting published](getting-published).
- Writing the books themselves? That's the
  [authoring volume](khb-authoring:index).
- Curious what's inside a `.khb`, how streaming works, or building your own
  compiler? See [KD Help Book Internals](khb-internals:index).
