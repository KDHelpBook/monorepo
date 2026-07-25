
# Compression (--mode)

`--mode` decides how the bundled files ship: `khb` (the default) copies every
docset as-is; `compact` gzips them for a smaller download.

## The two modes

| Mode | Ships |
|------|-------|
| `khb` | `docsets/foo.khb` — the file, byte for byte |
| `compact` | `docsets/foo.khb.gz` — gzip-compressed (best compression) |

`compact` compresses **every shipped file**: each docset *and* its `.khba`
attachment packs. The `.gz` suffix simply appends to the real name
(`foo.khb` → `foo.khb.gz`), and `docsets.json` records the `.gz` path, so any
file can be compressed independently of the others.

## How the viewer decompresses

The viewer detects gzip by the file's **magic bytes**, not its name, and inflates
with the browser's native `DecompressionStream('gzip')`. SQLite databases are
full of repeated strings and padding, so the ratio is usually substantial.

> [!NOTE]
> **Exceptions to `compact`:** docsets marked for [streaming](pack-stream.md) ship
> uncompressed even in compact mode (`Range` addresses raw bytes), and the
> [`--llms`](pack-llms.md) export stays plain text (it's meant to be read as-is).

## Compact vs. host-level compression

Many hosts (and CDNs) already apply gzip or brotli on the wire. That helps HTML
and JS, but hosts typically don't compress unknown binary types like `.khb` —
`compact` guarantees the small transfer regardless of host configuration, at the
cost of a one-time inflate in the browser. If your host demonstrably compresses
`.khb` responses, plain `khb` mode serves the same bytes with less indirection.
