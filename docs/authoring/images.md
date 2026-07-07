---
title: Images
keywords: [images, pictures, alt text, lightbox, figures, media]
categories: [markdown]
related: [assets, links, code-extensions]
---

# Images

Standard image syntax, with the target pointing at a file bundled under the book's
`assets/` folder:

```md
![How a docset is built](assets/khb-pipeline.svg)
```

An image renders inline, and the viewer offers a **lightbox** (click to enlarge).
Write meaningful `alt` text — it's what screen readers announce and what search sees.

## Where the file comes from

At compile time the `assets/…` path is rewritten to the internal `asset:` scheme and
resolved from the book's binary store — embedded in the `.khb` or in a sidecar
`.khba` pack. [Assets](assets) covers storage, downloads and resolution.

## Notes for KD Help Book

- Remote/absolute image URLs (`https://…`) are **not** fetched — content is
  origin-isolated and offline-first. Bundle images under `assets/` instead.
- Use forward slashes and keep files under `assets/`; other relative paths are left
  as plain links, which won't resolve inside the sandboxed frame.
