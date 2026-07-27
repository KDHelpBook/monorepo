
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
