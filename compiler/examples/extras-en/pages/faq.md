---
title: FAQ
keywords: [faq, docset, offline, search, collections]
categories: [basics, reference]
---
# FAQ

**Is a docset just a database?**
Yes — a `.khb` is a SQLite database, so anything that reads SQLite can open it.

**Does search work offline?**
Always. The index ships inside the docset; nothing is fetched at query time.

**Can I combine several docsets?**
That is the point. Multiple books load together and merge into one collection —
one tree, one index, one search — like the old classic help collections.
