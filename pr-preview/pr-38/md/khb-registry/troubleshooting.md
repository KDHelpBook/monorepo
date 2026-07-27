
# Registry troubleshooting

## The registry is empty

An empty **Manage docsets** page is the expected first-run state. It confirms
that the Worker, generated configuration, and viewer assets are reachable. Add
a publishing workflow or use **Open docset** locally to inspect a book.

Check the public endpoints directly:

```text
GET /config.json
GET /docsets.json
```

An empty `docsets` array is valid. A published book appears only after finalize
has written its `latest.json` pointer.

## Publishing returns 401

The token is missing, expired, has an invalid signature, or its audience does
not equal the request origin. Pass the public registry address as
`registry-url`; do not add a path or configure a separate audience.

Reverse proxies and custom domains must forward the request to the Worker under
the same public origin used by the workflow.

## Publishing returns 403

The OIDC token is valid but no publisher entry matches it. Compare:

- the exact `owner/name` in `repository`;
- the token's exact Git ref with `ref`;
- the GitHub environment name with `environment`;
- the compiled `docset.toml` ID with `docsets`.

Configuration changes deploy only after they reach the instance's production
branch.

## Publishing returns 409

The version or file already exists. Registry editions are immutable by default.
Increment `version` in `docset.toml`. Use forced publication only for an
explicit recovery policy with `force: true`.

## The viewer reports a fetch or streaming failure

Request the book with a one-byte range:

```sh
curl -i -H "Range: bytes=0-0" \
  https://your-registry.workers.dev/d/BOOK_ID/latest/BOOK_ID.khb
```

A healthy response is `206 Partial Content` with a matching `Content-Range`.
Also verify that `docsets.json` points at the expected ID, version, filename,
and optional hash.

## Local checks

Run the same checks as the template CI:

```sh
npm ci
npm run validate
npm run typecheck
npm run build
npx wrangler deploy --dry-run
```

Delete `.khb-registry` when generated files appear stale; the next build
recreates it from the installed package and `khb-registry.yml`.
