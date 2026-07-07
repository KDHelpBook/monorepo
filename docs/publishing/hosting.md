---
title: Hosting
keywords: [hosting, static, GitHub Pages, Range, CORS, gzip, CDN]
categories: [hosting]
related: [distribution, pack-stream, versioning]
---

# Hosting

A packed distribution is plain static files — **any static host works**: GitHub
Pages, Netlify, S3 + CloudFront, nginx, or a directory listing on an intranet
box. This page covers the few host behaviours that matter.

## GitHub Pages walkthrough

The viewer is built with base `"./"`, so the same dist works from a user site
root (`user.github.io/`) **or any repository subpath**
(`user.github.io/my-docs/`) — nothing to configure.

1. Pack your distribution: `khb pack --viewer dist --docset my.khb -o publish`.
2. Push the contents of `publish/` to the branch Pages serves (e.g. `gh-pages`),
   or upload it as a Pages artifact from a workflow.
3. Enable Pages on that branch in the repository settings.

GitHub Pages **honours HTTP `Range`**, so [streamed](pack-stream) books work
there at full effect — this site itself is packed with `--stream` and served
from Pages.

## HTTP Range (streaming)

A docset marked `"streaming": true` is opened with `Range` requests. The host
must:

- answer `Range: bytes=…` with `206 Partial Content`;
- serve the `.khb` **raw** — no transparent gzip/brotli re-encoding on it (byte
  offsets must match the file on disk).

If either fails, nothing breaks: the viewer falls back to fetching the whole
file. See [Streaming](pack-stream) for the packing side.

## Compressed transfer (`.khb.gz`)

Files packed with [`--mode compact`](pack-mode) ship pre-gzipped as
`<name>.khb.gz` and are inflated in the browser. This needs nothing from the
host — it's an ordinary binary file — and works even on hosts that never
compress unknown MIME types.

## CORS

**Same-origin hosting is the recommendation**: put the books in the same site as
the viewer (which is exactly what `pack` produces) and CORS never enters the
picture.

CORS only matters when a *viewer on origin A* loads a *docset from origin B* —
e.g. *File → Open docset from URL…* or a [.khbm manifest](khbm-manifests)
pointing at a CDN. Then origin B must send `Access-Control-Allow-Origin` for the
fetch to succeed, and expose `Range` handling cross-origin if you want streaming.

> [!WARNING]
> **GitHub release assets are not CORS-readable from browsers.** Since GitHub
> moved release downloads to Azure blob storage, the redirected asset responses
> lack CORS headers — a browser-based viewer simply cannot fetch a `.khb`
> straight from a release URL. That's why our CI **copies archived books into the
> site** ([versioning](versioning)) instead of linking to release assets: releases
> remain the archive of record for *people and CLIs* (`khb inspect <url>` works
> fine — no browser, no CORS), while everything a browser loads lives on the
> Pages origin.
