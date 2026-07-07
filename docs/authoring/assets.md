---
title: Assets
keywords: [assets, attachments, downloads, asset scheme, khba, sidecar, packs]
categories: [extensions]
related: [images, compiling, khb-internals:file-formats]
---

# Assets

Everything under the source folder's `assets/` directory (any depth) is stored in the
book and referenced from Markdown by its **docset-relative `assets/…` path**. At
compile time the compiler rewrites those targets to the internal `asset:` scheme, and
the viewer resolves them from the docset's binary store to a `data:` URL.

```md
![How a docset is built](assets/khb-pipeline.svg)

Download the [quick-reference card](assets/quick-reference.txt).
```

- An **image** (`![alt](assets/…)`) renders inline — see [Images](images).
- A **link to a non-image asset** (`[label](assets/…)`) becomes a **download**.
- Every file under `assets/` is stored whether or not a page references it, so a
  folder of downloadable extras needs no inline mentions.

## Embedded or sidecar

By default attachments are **embedded** in the `.khb`. Compile with
`--assets sidecar` to write them to a sibling **`.khba` pack** instead, keeping the
`.khb` itself lean — one docset can be backed by several packs, and a pack can be
fetched separately from (even later than) its book. See
[Compiling a book](compiling).

## How resolution works

Every asset is routed by the docset's `asset_index` straight to its owning store —
the embedded assets table or a specific `.khba` pack — so one docset can be backed by
several packs, and a lean `.khb` can pair with remote packs. If an asset's pack isn't
loaded, **Manage docsets** shows a "⚠ N missing assets" badge with an *Add pack…*
action.

> [!TIP]
> Ship a big book lean: compile with `--assets sidecar`, publish the `.khb` and the
> `.khba` side by side, and readers who never open the appendix imagery never fetch
> it.
