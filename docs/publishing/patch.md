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

## Add or replace, by id

Each patched book is matched against the manifest by its **docset id** (read from
the file, not the file name):

- an entry with the **same id** is replaced — the new file, metadata, and
  attachment packs take its place;
- a **new id** is appended to the manifest.

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
