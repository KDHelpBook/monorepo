# KD Help Book registry

A central documentation site many projects publish to **from their own CI,
without shared secrets, and without being able to touch each other's books**.
A Cloudflare Worker + R2 bucket that:

- accepts docset publishes authorized by **GitHub Actions OIDC** — a versioned
  permission map says which repository may write which docset ids;
- **serves `.khb`/`.khba` from R2 with HTTP `Range` → `206`**, exactly the
  contract the viewer's page-level streaming expects (`docs/streaming.md`);
- generates **`docsets.json`** on the fly from what's published, plus a central
  `folders` tree and ordering (`config/site.json`), and serves the built viewer
  as static assets;
- reserves `/mcp` for a future MCP server over the same data (currently `501`).

```
GitHub Actions (repo X)                     Cloudflare
┌───────────────────────┐   OIDC JWT   ┌──────────────────────────────┐
│ khb compile → .khb    │ ───────────► │ Worker                       │
│ khb inspect id gate   │              │  /publish/* verify + store   │
│ PUT + POST /publish   │              │  /d/*        Range 206 serve │
└───────────────────────┘              │  /docsets.json  from R2+site │
                                       │  /*          viewer assets   │
                                       └──────────────┬───────────────┘
                                     R2: docsets/<id>/<version>/*.khb
                                         docsets/<id>/latest.json
```

## Why repos can't overwrite each other

Authorization is a **map, not a token**: `config/permissions.json` pairs a
`repository` (and optionally a `ref`/`environment`) with the docset ids it may
publish. The worker derives every R2 key from that map plus the URL — never
from request content — so an authorized repo can only ever write under
`docsets/<its-own-id>/…`. Published versions are **immutable** (re-publishing a
version is `409`; `?force=1` needs an explicit `force: true` permission), and
the only mutable object per docset is its `latest.json` pointer — one atomic
write, so concurrent publishes of different docsets cannot conflict at all.

The worker's `.khb` check is a cheap SQLite-header sanity check, **not** the id
gate: the strong check is `khb inspect` in the publishing workflow (see
`examples/publish-docset.yml`), which reads the real meta table and refuses to
upload a book whose internal id differs from the publish target. (An in-worker
meta read is a possible follow-up; the security boundary is the permission map
either way.)

## Setup (manual, once)

1. Cloudflare account + `wrangler login` (or an API token).
2. Create the bucket: `wrangler r2 bucket create khb-registry-docsets`.
3. Pick the public origin (custom domain or `*.workers.dev`) and set
   `REGISTRY_AUDIENCE` in `wrangler.toml` to it — publishing workflows must
   request their OIDC token with exactly this audience.
4. Fill `config/permissions.json` (who may publish what) and `config/site.json`
   (entry order, the `folders` tree, viewer profile). Both are bundled at
   deploy: **changing permissions = a redeploy**, which keeps the whole
   authorization history in git.
5. Deploy: build the viewer (`cd ../viewer-ts && npm ci && npm run build`),
   copy `viewer-ts/dist` → `registry/public/`, then `npm run deploy`.
   Or run the `Registry deploy` workflow (`.github/workflows/registry-deploy.yml`)
   after adding `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets.

## Publish API

| Call | Meaning |
|------|---------|
| `PUT /publish/<id>/<version>/<file>` | upload one `.khb`/`.khba` (Bearer = OIDC JWT). Stored, not yet visible |
| `POST /publish/<id>/<version>` | finalize: body `{title, language, collection, file, attachments}` (from `khb inspect`); flips `latest.json` |
| `GET /d/<id>/<version>/<file>` | the bytes, Range-capable, immutable-cached |
| `GET /d/<id>/latest/<file>` | same via the pointer (`no-cache`) |
| `GET /docsets.json` / `GET /config.json` | the viewer manifest + profile |

Publishing repos copy `examples/publish-docset.yml`: compile → `khb inspect`
gate → mint the OIDC token (`audience=REGISTRY_AUDIENCE`) → `PUT` each file →
`POST` finalize → probe `Range: bytes=0-0` for `206`. Use a workflow
`concurrency` group per docset — same-docset publishes are last-writer-wins on
the pointer.

## Serving contract (what the viewer needs)

- `GET` with `Range: bytes=a-b` → `206` + `Content-Range: bytes a-b/<total>`
  (the probe is `bytes=0-0`; R2 returns the bytes, the worker synthesizes the
  header). Unsatisfiable → `416` with `bytes */<total>`.
- Bodies are always **raw** — no `Content-Encoding`; Range addresses SQLite
  pages, so never store `.gz` here.
- CORS on everything: `Access-Control-Allow-Origin: *`, `Content-Range`/
  `Content-Length` exposed, and `Range` allowed on preflight (it is not a
  CORS-safelisted header — cross-origin viewers do preflight).

## docsets.json generation

`GET /docsets.json` lists `docsets/*/latest.json`, orders entries per
`site.json.order` (unlisted append last), marks everything `streaming: true`
with versioned `/d/…` paths, and attaches `site.json.folders` verbatim (schema:
`docs/internals/manifest-schemas.md`). Cached ~60 s in the edge cache and
purged best-effort on finalize. Because placement lives here — centrally — a
publishing repo has no say in where its books appear in the tree.

## Local development

```sh
npm ci
npm test                 # vitest + workers pool (workerd-local R2; no account)
npm run dev              # wrangler dev on :8787

# Seed local R2 and try the contract:
wrangler r2 object put --local khb-registry-docsets/docsets/demo/1.0.0/demo.khb \
  --file ../compiler/examples.en.khb
# (write docsets/demo/latest.json the same way, or exercise /publish directly)
curl -sD- -o /dev/null -H "Range: bytes=0-0" \
  http://localhost:8787/d/demo/1.0.0/demo.khb     # expect 206 + Content-Range
curl http://localhost:8787/docsets.json
```

To see the viewer streaming from the local registry, copy `viewer-ts/dist` into
`registry/public/` and open `http://localhost:8787/` — the network tab shows
Range requests instead of a whole-file fetch, and the `folders` tree from
`site.json` renders in the Contents panel.
