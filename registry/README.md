# `@kdhelpbook/cf-registry`

Reusable Cloudflare Worker for a self-hosted KD Help Book registry. It serves
the web viewer, stores immutable `.khb` editions in R2, streams SQLite pages
with HTTP Range requests, and accepts secretless publishes from explicitly
allowed GitHub Actions repositories.

Most users should not clone this package source. Start from
[`KDHelpBook/cf-registry-template`](https://github.com/KDHelpBook/cf-registry-template),
which creates a repository, Worker, and R2 bucket through Cloudflare:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/KDHelpBook/cf-registry-template)

## Instance configuration

Each deployed instance has one `khb-registry.yml`:

```yaml
# yaml-language-server: $schema=./node_modules/@kdhelpbook/cf-registry/schema/khb-registry.schema.json
schema: 1

site:
  order: [product-docs]
  folders: []
  config:
    externalSources: true
    pwa: false
    prefetch: false
    prefetchLocked: false

publishers:
  - repository: acme/product
    ref: refs/heads/main
    environment: null
    docsets: [product-docs]
    force: false
```

`publishers` is the authorization boundary. The Worker verifies GitHub's OIDC
signature and claims, then derives every R2 key from the allowed docset id.
There are no publishing tokens or shared Cloudflare credentials.

The OIDC audience is the registry URL origin. A publishing workflow only needs
the public `registry-url`; there is no separate audience setting.

## Package interface

```ts
import { createRegistry } from "@kdhelpbook/cf-registry";
import config from "../.khb-registry/config.json";

export default createRegistry(config);
```

The package exports `createRegistry`, `RegistryConfig`, the public registry
types, and the editor schema at `@kdhelpbook/cf-registry/schema`. Its CLI
provides:

```sh
khb-cf-registry validate khb-registry.yml
khb-cf-registry prepare khb-registry.yml
```

`prepare` validates the YAML, writes `.khb-registry/config.json`, and copies the
version-matched viewer into `.khb-registry/public` for Wrangler Static Assets.

## Publishing a docset

Consumer repositories call the reusable workflow:

```yaml
jobs:
  publish:
    uses: KDHelpBook/monorepo/.github/workflows/publish-registry.yml@v1
    with:
      registry-url: https://your-registry.workers.dev
      source: docs
    permissions:
      contents: read
      id-token: write
```

The workflow compiles the source, reads metadata through `khb inspect --json`,
mints an origin-scoped GitHub OIDC token, uploads and finalizes the edition,
then verifies that the published file answers a `Range: bytes=0-0` request with
`206 Partial Content`.

## HTTP contract

| Route | Purpose |
| --- | --- |
| `PUT /publish/<id>/<version>/<file>` | Upload an authorized `.khb`/`.khba` |
| `POST /publish/<id>/<version>` | Atomically update `latest.json` |
| `GET /d/<id>/<version\|latest>/<file>` | Raw, Range-capable docset bytes |
| `GET /docsets.json` | Dynamic viewer manifest derived from R2 |
| `GET /config.json` | Viewer profile from the instance YAML |

Published version objects are immutable unless both the request and publisher
permission explicitly allow `force`. The main object's R2 ETag becomes the
optional manifest `hash` used by the viewer's HTTP and offline caches. Older
pointers without `hash` remain compatible.

`docsets.json` offers the current edition of each docset plus whatever older
editions `site.versions` allows (`latest` by default, or `all` / `minor`, capped
with `keep` and overridable per docset); the viewer lists them in its version
switcher and opens only the one a reader picks. `latest.json` is written at
`schema: 2`, which records title, language, and collection on every edition —
editions published by an older engine carry none and are left out of the manifest
until re-published, though they stay downloadable under `/d/`.

`/b/…` is reserved for a future server-rendered page route,
`/b/<collection>/<version|latest>/<language>/<pageId>` — the triple the viewer
resolves to one docset. Deep links today are the viewer's own
`#<docsetId>:<pageId>` fragment.

## Package development

```sh
npm ci
npm run typecheck
npm test
npm run build

# Build the real viewer before checking the release package:
(cd ../viewer-ts && npm ci && npm run build)
npm run stage-viewer
npm pack
```

Worker tests use a local workerd R2 binding. Deployable instance configuration
belongs in the template or an instance repository, never in this package.
