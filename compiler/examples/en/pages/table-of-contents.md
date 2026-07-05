---
title: The table of contents
keywords: [table of contents, toc, tree, navigation, hierarchy]
categories: [authoring]
---
# The table of contents

The left-hand tree comes from `toc.yaml`, which nests pages by id:

```yaml
- page: getting-started
  children:
    - page: what-is-khb
- page: authoring
  children:
    - page: writing-pages
```

Order in the file is order in the tree. A node with children can still have its
own content — clicking it opens a section landing page.

If you prefer, you can omit `toc.yaml` and let the folder structure drive the
tree (numeric prefixes such as `3.reference/2.samples.md` set the order, as in
Docusaurus).
