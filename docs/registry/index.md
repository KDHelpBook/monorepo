---
title: KD Help Book Registry
keywords: [registry, Cloudflare Workers, R2, self-hosted, overview]
categories: [registry]
related: [deploy, configuration, publishing, khb-publishing:hosting]
---

# KD Help Book Registry

The KD Help Book Registry is a self-hosted documentation site for teams that
publish several help books from separate repositories. One Cloudflare Worker
serves the viewer and a dynamic manifest, while a private R2 bucket stores
immutable `.khb` editions.

Publishing repositories authenticate with short-lived GitHub Actions OIDC
tokens. There is no shared upload password, Cloudflare API token, or registry
secret to distribute. The registry configuration names exactly which
repository, ref, and optional GitHub environment may publish each docset.

## When to use it

Use a registry when:

- several repositories should publish into one documentation portal;
- books should stream directly from R2 with HTTP `Range`;
- publication should be secretless and restricted per docset;
- site order, folders, and viewer configuration should be managed centrally;
- old versions must remain immutable while `latest` moves atomically.

For one repository publishing one static site, [`khb pack`](khb-publishing:pack)
and an ordinary static host are usually simpler.

## How the pieces fit

| Component | Responsibility |
|---|---|
| `@kdhelpbook/cf-registry` | Worker runtime, configuration schema, CLI, and matching viewer |
| `KDHelpBook/cf-registry-template` | Deployable instance repository |
| `khb-registry.yml` | Site layout and publisher authorization |
| Cloudflare Worker | HTTP API, viewer, OIDC verification, and manifest generation |
| R2 bucket | Immutable `.khb`/`.khba` files and mutable `latest.json` pointers |
| `publish-registry.yml` | Reusable GitHub Actions publishing workflow |

## Routes and reserved paths

The Worker answers `/docsets.json`, `/config.json`, `/d/<id>/<version|latest>/<file>`
(Range-capable bytes) and the `/publish/…` API; everything else is the viewer's
static assets.

Two prefixes are reserved for work not done yet: `/mcp` for an MCP server, and
`/b/` for server-rendered pages, addressed as
`/b/<collection>/<version|latest>/<language>/<pageId>`. That shape mirrors what
the viewer already resolves — a product, an edition of it, a language of that
edition, a page — and stays meaningful for a statically rendered page, which a
fragment (`#docsetId:pageId`, how the viewer deep-links today) cannot be. It is
deliberately *not* keyed by docset id: an id pins one language but spans many
versions, so a `/b/<id>/…/<language>/…` path could contradict itself.

Start with [Deploy to Cloudflare](deploy), then configure the allowed
[publishers](configuration) and add a [publishing workflow](publishing).
