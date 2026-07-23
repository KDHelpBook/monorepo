
# Streaming (--stream)

`--stream` marks docsets for **page-level streaming**: instead of downloading the
whole `.khb` up front, the viewer opens it over HTTP `Range` and reads only the
pages a visitor actually touches. Worth it for big books; a small book is often
cheaper to fetch whole.

## Syntax

```bash
khb pack … --stream                      # mark every bundled docset
khb pack … --stream big.khb              # mark only this one (repeatable)
khb pack … --stream big.khb --stream atlas.khb
```

A `--stream <path>` must name one of the `--docset` paths (matched by full path
or by file name) — anything else is an error, so a typo can't silently ship an
unstreamed book. [patch](patch.md) accepts `--stream` too, applied to the docsets
being added or replaced.

## What it does

All the flag changes is one field in the docset's manifest entry:

```json [docsets.json]
{ "file": "docsets/big.khb", "id": "big-book", "title": "Big Book",
  "language": "en", "streaming": true }
```

The viewer treats it as a **preference, not a promise**: it opens the file (and
its attachment packs) over `Range`, and if the host doesn't honour `Range` — or
the streamed open fails for any reason — it **falls back automatically** to
fetching the whole file. A streamed distribution works everywhere; it's just
faster where the host cooperates. How the viewer reads a database it never
downloads — the Range-VFS, block coalescing, and the wa-sqlite engine — is
covered in [Internals: streaming](khb-internals:streaming).

## The uncompressed rule

> [!WARNING]
> `Range` requests address **raw SQLite pages by byte offset**, so a streamed file
> must be served exactly as written. Under [`--mode compact`](pack-mode.md) streamed
> docsets (and their packs) are therefore shipped **uncompressed** while everything
> else gzips; likewise, a `"streaming": true` on a `.gz` entry is ignored. Don't
> "fix" this by hand-gzipping a streamed file.

Your host must also serve the file raw — no transparent gzip/brotli re-encoding on
`.khb` responses — or byte offsets stop matching. See [Hosting](hosting.md) for
host-side requirements.

## Keep streamed books offline (`--prefetch`)

Streaming is fast to *start* but re-reads pages from the network. `--prefetch`
adds a **"Keep books offline"** toggle to the viewer's **View** menu and sets its
default on:

```bash
khb pack … --stream --prefetch
```

When the toggle is on, a streamed book is used immediately **and** downloaded
whole in the background; the whole copy is cached in the browser (IndexedDB,
keyed by content hash) and the open book is **hot-swapped** to it with no reload.
Later visits open straight from that cache — instant and offline — until a new
build changes the content hash. It caches the **whole book and all its attachment
packs**, so images and downloads come with it — a prefetched book is fully
offline. It's a per-device user choice: `--prefetch` only sets the **default**,
and a reader can flip it either way. Off (the default without the flag) keeps the
pure page-by-page streaming behaviour.

To turn the feature off entirely — hide the toggle and never prefetch, whatever a
reader chose — pack with `--no-prefetch` (for sites that don't want the offline
cache, e.g. metered bandwidth):

```bash
khb pack … --stream --no-prefetch
```
