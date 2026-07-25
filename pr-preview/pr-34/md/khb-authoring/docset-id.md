
# id (docset.toml)

The docset's identifier. **Required.**

## Syntax

```toml
id = "my-docs"
```

## Rules

There is no fallback — pick one and keep it. The id must be unique among the books a
reader loads together, and it's your public contract: other books link into yours as
`your-id:page`, so changing it breaks them.

## Example

```toml
id = "khb-authoring"
```

## In the viewer

The id namespaces every page — `docsetId:pageId` — which is what lets many books
merge into one collection without colliding. It's the prefix in
[cross-book links](links.md) and cross-book [related](frontmatter-related.md) entries,
the id recorded in a published site's `docsets.json`, and the host in the address bar
(`khb://my-docs/welcome.htm`). Versioned editions of one book use **distinct ids**
that share a [collection](docset-collection.md).
