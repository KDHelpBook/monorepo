---
title: Registry configuration
keywords: [khb-registry.yml, schema, publishers, permissions, folders, prefetch]
categories: [registry, configuration]
related: [deploy, publishing, updates, khb-internals:manifest-schemas]
---

# Registry configuration

Every instance is controlled by one `khb-registry.yml`. The template points
YAML language servers at the JSON Schema shipped by the exact installed package,
so editors can complete fields and report mistakes before CI.

```yaml
# yaml-language-server: $schema=./node_modules/@kdhelpbook/cf-registry/schema/khb-registry.schema.json
schema: 1

site:
  order: [product-docs]
  folders:
    - id: products
      title: Products
      children:
        - collection: product
  versions:
    mode: minor
    keep: 6
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

## Top-level fields

| Field | Meaning |
|---|---|
| `schema` | Configuration format version. Version 1 requires the value `1`. |
| `site` | Viewer manifest layout, version policy, and runtime viewer configuration. |
| `publishers` | Repositories allowed to write named docsets. |

## Site layout

`site.order` lists docset IDs in display order. Published docsets not listed
there are appended in stable storage-listing order.

`site.folders` is emitted into the dynamic `docsets.json`. Folder nodes can
contain nested folders, docset IDs, or collection selectors. The complete
manifest shape is documented in
[Manifest schemas](khb-internals:manifest-schemas).

## Offering older versions

R2 keeps every published edition for ever, but `docsets.json` offers only the
current one unless `site.versions` says otherwise. What it offers appears in the
viewer's **Version** selector; readers pin an edition per product and the choice
persists on their device.

```yaml
site:
  versions:
    mode: minor        # latest (default) | all | minor
    keep: 6            # optional cap, newest first
    docsets:
      product-docs:    # optional per-docset override
        mode: all
        keep: 20
```

| `mode` | Offers |
|---|---|
| `latest` | nothing beyond the current edition — the default, and what every registry did before this setting existed |
| `all` | every edition still recorded in the docset's `latest.json` |
| `minor` | the newest patch of each minor series, so `1.4.2` hides `1.4.1` and `1.4.0` |

The current edition is always listed, whatever the rule says, and `keep` caps only
the older ones. A per-docset entry overrides the site-wide `mode`/`keep` for that
docset; unlisted docsets follow the site rule.

Two things a policy does **not** do: it never deletes anything (an edition it stops
offering is still downloadable at `/d/<id>/<version>/<file>`), and it can't offer an
edition published before registry engine 2 — those carry no title or language of
their own, so the switcher couldn't name them (see [Update a registry](updates)).

Changing the policy is a configuration change: it ships with the next Worker
deployment and shows up once the shared `/docsets.json` cache expires (a minute).

`site.config` becomes the viewer's `/config.json`:

| Field | Default behaviour |
|---|---|
| `externalSources` | Allows readers to open or import books outside the registry when `true`. |
| `pwa` | Registers the viewer service worker when `true`. |
| `home` | Optional page ID, or `search`, used for a cold start. |
| `prefetch` | Defaults offline prefetch on when `true`; leave `false` for normal registry streaming. |
| `prefetchLocked` | Hides and disables offline prefetch when `true`. |

## Publisher permissions

Each entry grants one GitHub repository access to a non-empty set of docset IDs:

- `repository` is the exact, case-sensitive `owner/name` OIDC claim;
- `ref`, when present, is an exact ref such as `refs/heads/main`;
- `environment`, when present, is the exact GitHub environment claim;
- `docsets` is the complete set of IDs this entry may publish;
- `force` defaults to `false` and should normally stay off.

Entries can overlap. The effective permission is the union of all entries whose
repository, ref, and environment restrictions match the OIDC token.

The Worker verifies the token audience against the origin handling the request,
for example `https://docs.example.com` or
`https://my-registry.example.workers.dev`. Custom domains need no separate
audience setting.

Validate every change before merging:

```sh
npm run validate
```
