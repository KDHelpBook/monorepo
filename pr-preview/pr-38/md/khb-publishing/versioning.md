
# Versioning

The viewer can carry **several versions of one book** and show exactly one at a
time, with a switcher to reach the others. This page covers what the switcher
needs from a publisher and a convention that keeps a version archive cheap to
run.

## How the switcher works

Version editions of a book are **separate docsets** that share a `collection`
but differ in `version` (both from `docset.toml` — see
[Authoring: version](khb-authoring:docset-version)). When more than one is
loaded:

- the viewer shows only the **latest** by default — a numeric-dotted comparison,
  so `1.10 > 1.2`;
- a **Version** selector appears (in the left panel, and per product under
  *Manage docsets…*) to pin an older one; the choice persists across reloads;
- the same book never appears twice in the merged table of contents.

## Unique ids per version

Page ids are namespaced `docsetId:localId`, so two versions of one book **must
not share a docset id** — they'd collide. The convention: the tip keeps the bare
id, and each archived edition suffixes it with its version:

| Edition | `id` | `version` | `collection` |
|---------|------|-----------|--------------|
| current | `my-docs` | `latest` | `my-product` |
| archive | `my-docs-v1.1.2` | `1.1.2` | `my-product` |
| archive | `my-docs-v1.0.4` | `1.0.4` | `my-product` |

## The "latest" convention

Publish the tip with the literal version **`latest`**: non-numeric strings sort
*above* numeric versions in the viewer's comparison, so the current build is
always the default pick, with the numbered archives selectable behind it — and no
release ever "overtakes" the tip.

## One archive per minor series

Keep the switcher list short: merge only the **newest patch of each minor
series** into the site (`1.1.0`/`1.1.1`/`1.1.2` → only `1.1.2`). Superseded
patches stay downloadable from your releases; they just aren't merged.

## The worked example: our CI

This documentation is published with exactly this scheme, in three workflows:

1. **Release** — bumps `version` in every volume's `docset.toml`, tags, and
   creates the GitHub release.
2. **Build** — on a release tag, compiles each volume with a version-suffixed id
   (`khb-publishing` → `khb-publishing-v1.2.0`) and uploads the `.khb`s as
   **release assets**: the durable archive.
3. **Publish** — compiles the current volumes as version `latest`, packs the
   site, then downloads the newest patch of each minor series from past releases
   and merges each with `khb patch publish --docset <old>.khb --stream`.

Release assets are the archive *source*, not what browsers load — they're copied
into the site because browsers can't fetch them directly (see
[Hosting](hosting.md) on CORS).

> [!TIP]
> The id and version suffixing happens **at build time only** (a `sed` over
> `docset.toml` in the workflow) — nothing version-suffixed is ever committed.
