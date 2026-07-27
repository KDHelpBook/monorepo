
# Getting published

From a compiled book to a live documentation site in five minutes. You need two
inputs: a **built viewer** and at least one **`.khb` docset**.

## 1. Get the viewer

Every release ships the viewer as a ready-built archive
(`khb-viewer-vX.Y.Z.tar.gz` under the release's assets) — unpack it anywhere. Or
build it from source:

```bash
cd viewer-ts
npm ci
npm run build      # -> viewer-ts/dist
```

## 2. Get a book

If you haven't compiled one yet, the [authoring volume](khb-authoring:compiling)
covers `khb compile`:

```bash
khb compile my-docs -o my.khb
```

## 3. Pack

`khb pack` copies the viewer, bundles the books, and writes the manifest and
config the viewer reads on start:

~~~code-preview
```bash
khb pack --viewer viewer-ts/dist --docset my.khb -o publish
```
```
packed 1 docset(s) + viewer -> publish
```
~~~

What lands in `publish/`:

| Entry | What it is |
|-------|------------|
| `index.html`, `assets/…` | the viewer, copied verbatim |
| `docsets/my.khb` | your book (plus any sidecar `.khba` packs found next to it) |
| `docsets.json` | the manifest listing every bundled book |
| `config.json` | the distribution profile (external sources, PWA, home page) |

Both JSON files are described in [Anatomy of a distribution](distribution.md).

## 4. Serve it

The output is plain static files — serve the directory with anything:

```bash
python3 -m http.server -d publish 8080
```

then open `http://localhost:8080`. For real hosting (GitHub Pages included) see
[Hosting](hosting.md).

> [!TIP]
> The defaults produce a `reader` profile: visitors can open their own docsets and
> a service worker caches the app for offline use. Publishing a single product's
> locked-down docs? See [Profiles](pack-profiles.md).
