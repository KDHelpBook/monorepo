---
title: patch — update a distribution
keywords: [patch, update, replace docset, manifest, in place, CI]
categories: [packing]
related: [pack, versioning, distribution]
---

# patch — update a distribution

`khb patch` adds or replaces docsets in an **already-built distribution**,
updating `docsets.json` in place — no need to re-run [pack](pack) with the full
docset list, and no viewer files are touched.

~~~code-preview
```bash
khb patch publish/ --docset new.khb
```
```
patched 1 docset(s) into publish/
```
~~~

## Add or replace, by id and version

Each patched book is matched against the manifest by its **docset id and
`version`** (both read from the file, not the file name):

- the **same id and version** replaces that edition in place — the new file,
  metadata, and attachment packs take its place, wherever it sits;
- a **new version of a known id** joins that book's entry: a higher version
  becomes the current edition and pushes the previous one into its
  [archive](versioning), a lower one just joins the archive;
- a **new id** is appended to the manifest.

So patching in an old release adds a version to the switcher instead of replacing
the current book, and re-patching a rebuilt book of the same version updates it.

Like `pack`, `patch` picks up sibling attachment packs (`foo.khba`,
`foo.<tag>.khba`) next to each `.khb` and records them in the entry's
`attachments`. Everything else in `docsets.json` — and all of `config.json` — is
left untouched.

## Flags

| Flag | Meaning |
|------|---------|
| `--docset <path>` | a docset to add or replace (repeatable, at least one) |
| `--mode khb\|compact` | ship the patched books gzipped — see [Compression](pack-mode) |
| `--stream [<path>…]` | mark the patched books for streaming — see [Streaming](pack-stream) |

`--mode` and `--stream` apply **only to the docsets being added or replaced**;
existing entries keep whatever they were packed with. That makes `patch` the
natural CI verb for [archived versions](versioning): pack the current site once,
then patch in each archived book downloaded from a release.
