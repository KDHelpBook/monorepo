# Security policy

## Supported versions

KD Help Book is pre-1.0 software. Security fixes are provided for the latest
published `0.0.x` release only. Older releases are not supported.

| Version | Supported |
|---------|-----------|
| Latest `0.0.x` | Yes |
| Older releases | No |

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/KDHelpBook/monorepo/security/advisories/new).
Do not open a public issue before a fix is available.

Include the affected component and version, reproduction steps, impact, and any
suggested mitigation. We will acknowledge a complete report within five business
days and coordinate disclosure after a fix is ready.

KD Help Book treats compiled docsets as untrusted input. Reports that escape the
viewer sandbox, access data from another docset, execute authoring extensions
without `--allow-extensions`, or compromise the registry publishing boundary are
especially important.
