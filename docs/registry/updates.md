---
title: Update a registry
keywords: [updates, Dependabot, npm, version, rollback]
categories: [registry, deployment, automation]
related: [deploy, configuration, troubleshooting]
---

# Update a registry

The template pins `@kdhelpbook/cf-registry` to an exact version. This keeps the
Worker runtime, configuration validator, schema, and bundled viewer on one
tested release.

Dependabot checks weekly and opens a pull request when a newer release is
available. A normal update is:

1. read the KHB release notes;
2. review the package and lockfile change;
3. let the instance CI run `npm ci`, validation, typecheck, and build;
4. merge the pull request to `main`;
5. wait for the production Cloudflare deployment;
6. open `/config.json`, `/docsets.json`, and one published book.

There are no Cloudflare previews for instance pull requests. Preview Workers
would need a separate R2 data model and are deliberately outside version 1;
ordinary static Book PR Previews remain independent.

## Roll back the engine

Revert the Dependabot merge or restore the previous exact package version and
lockfile, then merge to `main`. Published R2 objects are not deleted or migrated
by an engine deployment, so rolling back the Worker does not discard books.

Configuration format changes are versioned by the top-level `schema` field.
Run `npm run validate` with the new package before deployment and do not change
`schema` until the release notes require it.

## Pointer format 2 (offering older versions)

Each docset's `latest.json` now records display metadata — title, language,
collection — on **every** edition, not only the current one, so the viewer's
version switcher can name an edition as it was published rather than as the book
is called today. Pointers written this way carry `"schema": 2`.

This is a one-way format change with no backfill, and it is deliberately quiet:

- nothing is deleted or rewritten on deployment, and every published file stays
  reachable at `/d/<id>/<version>/<file>`;
- the **current** edition is unaffected — a registry that offers only the current
  edition (the default `site.versions`) behaves exactly as before;
- editions published by an older engine carry no metadata of their own, so
  `docsets.json` leaves them out of the version switcher. The next publish of a
  docset moves the superseded edition down with its metadata intact, so a docset's
  history starts filling in from its next release.

There is nothing to run: publish once per docset and the archive builds itself.
