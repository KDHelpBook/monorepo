---
title: Versioning
keywords: [versions, version switcher, latest, archive, releases, collection]
categories: [versioning]
related: [patch, distribution, hosting, khb-authoring:docset-version]
---

# Versioning

The viewer can carry **several versions of one book** and show exactly one at a
time, with a switcher to reach the others. This page covers what the switcher
needs from a publisher and a convention that keeps a version archive cheap to
run.

## How the switcher works

Editions of a book are the **same docset** — same `id`, same `collection` —
compiled at different `version`s (from `docset.toml`; see
[Authoring: version](khb-authoring:docset-version)). When a site ships more than
one:

- the viewer shows only the **latest** by default — a numeric-dotted comparison,
  so `1.10 > 1.2`;
- a **Version** selector appears (in the left panel, and per product under
  *Manage docsets…*) to pin an older one; the choice persists across reloads;
- the same book never appears twice in the merged table of contents.

Because every edition shares the book's id, page ids don't change with the
version: the reader's open tabs, favourites and links survive a switch, and a
cross-book link to `my-docs:page` resolves in whichever edition is loaded.

## Shipping an archive

`khb pack` folds editions of one book into a single manifest entry — pass them
all, newest or oldest first, it doesn't matter:

```bash
khb pack --viewer viewer/dist --out publish \
  --docset my-docs-2.1.0.khb --docset my-docs-2.0.3.khb --stream
```

The highest version becomes the entry; the rest become its
[`versions`](khb-internals:manifest-schemas). Two files with the same id **and**
version are an error — editions must differ in `version`.

[`khb patch`](patch) does the same to an already-built site, which is what makes
it the natural CI verb: pack the current site once, then patch each archived
book in. A patched edition that outranks the current one takes its place and
pushes it into the archive.

> [!NOTE]
> Only the current edition of each book is written into `llms.txt` and
> `sitemap.xml` — an archive holds the same pages at older revisions, and listing
> them would duplicate every URL.

## One archive per minor series

Keep the switcher list short: merge only the **newest patch of each minor
series** into the site (`1.1.0`/`1.1.1`/`1.1.2` → only `1.1.2`). Superseded
patches stay downloadable from your releases; they just aren't merged. A
[registry](khb-registry:configuration) applies the same rule with
`site.versions: { mode: minor }` instead of choosing files at pack time.

## The "latest" convention

Publish the tip with the literal version **`latest`**: non-numeric strings sort
*above* numeric versions in the viewer's comparison, so the current build is
always the default pick, with the numbered archives selectable behind it. It also
keeps the tip from colliding with the release it was cut from — the tip's
`docset.toml` still names the last released version, and an archive with that
exact version would otherwise replace it.

## The worked example: our CI

This documentation is published with exactly this scheme, in three workflows:

1. **Release** — bumps `version` in every volume's `docset.toml`, tags, and
   creates the GitHub release.
2. **Build** — on a release tag, compiles each volume and uploads the `.khb`s as
   **release assets** named `<id>-v<version>.khb`: the durable archive. (The file
   name carries the version; the docset id inside stays the book's own.)
3. **Publish** — compiles the current volumes as version `latest`, packs the
   site, then downloads the newest patch of each minor series from past releases
   and merges each with `khb patch publish --docset <old>.khb --stream`.

Release assets are the archive *source*, not what browsers load — they're copied
into the site because browsers can't fetch them directly (see
[Hosting](hosting) on CORS).

## Sites built before this

Older archives were published under **version-suffixed docset ids**
(`my-docs-v1.1.2` sharing a collection with `my-docs`), because `khb patch` used
to identify a book by its id alone and would have replaced the current entry.
Nothing breaks: the viewer still reads such a manifest, and those editions still
appear in the switcher — as separate books of one product. What they cost is why
the convention changed: their page ids differ from the current edition's, so
switching to one drops the reader's tabs and deep links, and a cross-book link
written as `my-docs:page` can never reach them. Re-pack (or re-patch) with the
bare id to fold them into one book.
