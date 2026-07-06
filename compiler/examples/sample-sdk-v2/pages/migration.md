---
title: Migrating from 1.0
keywords: [migration, upgrade, breaking changes]
categories: [guide]
---
# Migrating from 1.0 to 2.0

This page exists **only in 2.0** — switch the Version selector to 1.0 and it
disappears from the table of contents.

Replace fire-and-forget `send()` calls with awaited `sendAsync()`:

```diff
- client.send(message);
+ await client.sendAsync(message);
```
