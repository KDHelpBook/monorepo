
# version (docset.toml)

The edition of the book — the docs' version, usually tracking the product it
documents.

## Syntax

```toml
version = "1.2.0"
```

## Default

`0.1.0` when omitted.

## Example

Two source folders, one product at two versions — distinct
[ids](docset-id.md), shared [collection](docset-collection.md), different `version`:

~~~code-group
```toml [v2/docset.toml]
id = "sdk-v2"
title = "SDK Guide"
version = "2.0.0"
collection = "sdk"
```
```toml [v1/docset.toml]
id = "sdk-v1"
title = "SDK Guide"
version = "1.0.0"
collection = "sdk"
```
~~~

## In the viewer

The version is surfaced read-only in **Help → About**, in **Manage docsets**, and as
a tooltip on the product folder in the table of contents. When one collection is
loaded in **several versions**, only the **latest** shows by default
(numeric-dotted comparison, so `1.10 > 1.2`); a **Version** selector appears to pin
an older one, and the choice persists across reloads. Publishing archived versions
alongside the tip is covered in [Versioning](khb-publishing:versioning).
