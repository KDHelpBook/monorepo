
# File formats

The KD Help Book family is three file kinds plus one orthogonal compression
convention. The normative description is `docs/format.md` in the repository; this
page is the tour.

| Extension | What it is | Read by |
|-----------|------------|---------|
| `.khb`  | the SQLite docset — the canonical, queried form | native SQLite / sql.js / wa-sqlite |
| `.khbb` | a minimal binary (no SQLite container, no indexes) | rebuilt into a `.khb` before use |
| `.khba` | a sidecar SQLite file of attachments (images, downloads) | opened beside its `.khb` |

## `.khb` — the docset

A `.khb` is a plain **SQLite database**. Everything the viewer needs is precomputed
at build time — rendered HTML, plain text, the table of contents, the category
facet, the F1 keyword index and the full-text index — so search is instant and
works offline, and anything that reads SQLite can open the file. The database is
`VACUUM`ed after writing, and its fixed 4096-byte page size is what makes
[streaming](streaming.md) possible later.

The format is **independent of the source format**: the canonical render a `.khb`
stores is HTML, and the viewer never needs Markdown. A producer *may* also stash a
clean Markdown rendition in the optional `pages.md` column, but that is an
enrichment for AI-facing consumers, not a requirement — see the
[SQLite schema](sqlite-schema.md).

## `.khbb` — the minimal binary

`.khbb` is a compact [postcard](https://docs.rs/postcard) encoding of the rendered
docset: pages as HTML + plain text, the TOC, categories, keywords **and embedded
assets** — but **no SQLite container and no FTS index**. It is the smallest way to
ship a docset; the consumer rebuilds a real `.khb` from it (the browser does this
in wasm and caches the result in IndexedDB).

The payload sits inside a **versioned wrapper** so it can be validated before use:
the file carries a `format_version`, and a reader rejects any version other than
the one it was built for. Unlike the SQLite form — where old tables simply keep
working — a `.khbb` is a serialized snapshot of the rendered-docset layout, so
every format bump (see the [SQLite schema](sqlite-schema.md)) gates it.

`khb convert` turns a `.khb` into a `.khbb` and back; the direction is inferred
from the file extensions.

## `.khba` — attachment sidecars

A `.khba` holds binary attachments — the same `assets` table a `.khb` embeds, plus
a `meta` table — as a **separate SQLite file** shipped next to a lean `.khb` whose
own `assets` table is empty. Each sidecar carries a stable id in `meta.pack` (its
filename), and one `.khb` may be backed by **several** packs.

Resolution never probes: the `.khb`'s `asset_index` table maps every asset path to
its owning store (`''` = embedded, otherwise a sidecar's `meta.pack` id), so
opening an asset is one lookup followed by one read of the right file. Routing by
id rather than position means packs can be opened in any order — and, when packs
are streamed over HTTP, that one ranged read replaces N probes.

## `.gz` — compression is a suffix, not a format

Any of the files above may ship gzip-compressed as `<name>.gz` (`foo.khb.gz`,
`foo.khba.gz`, …). Compression is **orthogonal**: there is no distinct compressed
format, and the viewer decides by the gzip **magic bytes** (`1f 8b`), never by the
name.

> [!TIP]
> Magic-based sniffing means a host that auto-applies `Content-Encoding: gzip` for
> `.gz` files — and therefore hands the browser *pre-decompressed* bytes — works
> just as well as one that serves the bytes verbatim. Either way the viewer ends up
> with a valid SQLite file.

The exception is a **streamed** docset: `Range` requests must address raw SQLite
pages, so streamed files always ship uncompressed (see [Streaming](streaming.md) and
[khb pack's compact mode](khb-publishing:pack-mode)).
