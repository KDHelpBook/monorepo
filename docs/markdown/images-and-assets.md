---
title: Images & assets
keywords: [images, assets, attachments, downloads, asset scheme, khba]
categories: [media]
related: [links, code-blocks]
---

# Images & assets

Reference images and downloadable files by their **docset-relative `assets/…` path**.
At compile time the compiler rewrites those targets to the internal `asset:` scheme,
and the viewer resolves them from the docset's binary store (embedded in the `.khb`
or a sidecar `.khba` pack) to a `data:` URL.

```md
![How a docset is built](assets/khb-pipeline.svg)

Download the [quick-reference card](assets/quick-reference.txt).
```

- An **image** (`![alt](assets/…)`) renders inline; the viewer offers a lightbox.
- A **link to a non-image asset** (`[label](assets/…)`) becomes a download.

## How resolution works

Every asset is routed by the docset's `asset_index` straight to its owning store — the
embedded `assets` table or a specific `.khba` pack — so one docset can be backed by
several packs, and a lean `.khb` can pair with remote packs. If an asset's pack isn't
loaded, **Manage docsets** shows a "⚠ N missing assets" badge with an *Add pack…*
action.

## Notes for kdhelp

- Use forward slashes and keep assets under `assets/`; other paths are left as plain
  relative links (which won't resolve inside the sandboxed frame).
- Remote/absolute image URLs (`https://…`) are **not** fetched — content is
  origin-isolated and offline-first. Bundle images as assets instead.
- Video/embed directives (`:video{…}`) are **not** supported yet — see the roadmap in
  the [overview](#overview).
