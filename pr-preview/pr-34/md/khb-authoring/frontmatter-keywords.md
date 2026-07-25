
# keywords (frontmatter)

The terms under which the page appears in the **keyword index** — the classic
F1-style Index panel.

## Syntax

```yaml
keywords: [installation, setup, requirements]
```

## Default

None — the page simply has no Index entries. (It stays fully searchable; keywords are
curated lookup terms, not the search corpus.)

## Example

```yaml
keywords: [compile, build, CLI, khb compile]
```

## In the viewer

Each term becomes an entry in the **Index** panel's type-ahead list, jumping straight
to the page. The index unions across all loaded books, and one term may be claimed by
several pages — across books, too. Keywords are also indexed for full-text search
alongside the title and body, so they lift the page's ranking for those queries (see
[Full-text search](khb-internals:full-text-search)).

> [!TIP]
> Write keywords as a reader would look them up: 5–8 concrete terms, including the
> synonyms your prose avoids.
