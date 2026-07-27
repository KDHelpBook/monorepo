
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
| `site` | Viewer manifest layout and runtime viewer configuration. |
| `publishers` | Repositories allowed to write named docsets. |

## Site layout

`site.order` lists docset IDs in display order. Published docsets not listed
there are appended in stable storage-listing order.

`site.folders` is emitted into the dynamic `docsets.json`. Folder nodes can
contain nested folders, docset IDs, or collection selectors. The complete
manifest shape is documented in
[Manifest schemas](khb-internals:manifest-schemas).

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
