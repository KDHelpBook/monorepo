
# Publish from GitHub Actions

An allowed content repository calls the reusable workflow from a job. It needs
read access to the source and permission to request a GitHub OIDC token, but no
secrets:

```yaml
name: Publish documentation

on:
  push:
    branches: [main]
    paths: ["docs/**"]
  workflow_dispatch:

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

The `id` in `docs/docset.toml` must occur in this repository's `docsets`
permission in `khb-registry.yml`. If the permission restricts `ref`, the
workflow must run on that exact ref.

## Workflow inputs

| Input | Required | Purpose |
|---|---:|---|
| `registry-url` | yes | Public registry URL; its origin becomes the OIDC audience. |
| `source` | yes | Directory containing `docset.toml`. |
| `ref` | no | Content ref to check out instead of the caller commit. |
| `version` | no | Exact KHB release tag, or `latest`; an exact workflow tag pins automatically. |
| `allow-extensions` | no | Enables trusted authoring extensions during compilation. |

## Publication sequence

The reusable workflow:

1. checks out the content and a pinned KHB toolchain;
2. compiles the source to `.khb`;
3. reads stable metadata using `khb inspect --json`;
4. requests a short-lived OIDC token whose audience is the registry origin;
5. uploads the immutable files;
6. finalizes the version by atomically replacing `latest.json`;
7. verifies that the published file answers a one-byte Range request with
   `206 Partial Content`.

The main R2 object's ETag is recorded as `hash` in the pointer and dynamic
manifest. The viewer uses it to keep streamed HTTP ranges and offline cache
entries tied to the correct content.

Publishing an existing version returns `409` unless the matching publisher has
`force: true` and explicitly requests a forced publication. Prefer incrementing
the docset version.
