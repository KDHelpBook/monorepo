---
title: Profiles (--profile, --lock, --pwa)
keywords: [profile, reader, bundled, lock, PWA, service worker, config.json]
categories: [packing]
related: [pack, distribution, hosting]
---

# Profiles (--profile, --lock, --pwa)

`--profile` picks a pair of defaults that `config.json` records; `--lock`,
`--pwa`, and `--no-pwa` override the two switches individually.

## The two profiles

| Profile | `externalSources` | `pwa` | Use |
|---------|-------------------|-------|-----|
| `reader` (default) | `true` | `true` | a general reader: visitors can open, upload, and manage docsets |
| `bundled` | `false` | `false` | one product's docs, locked down — the site serves exactly the books you packed |

So `--profile reader` writes:

```json [config.json]
{
  "externalSources": true,
  "pwa": true
}
```

and `--profile bundled` writes both as `false`.

## What each switch does

**`externalSources: false`** removes docset management from the UI entirely:
*File → Open docset…*, *Open docset from URL…*, and the whole **Manage docsets**
page are hidden, and the viewer skips loading any uploaded or remote docsets and
attachment packs a visitor's browser may have persisted. Docsets are read-only
either way — this removes the reader's ability to add, remove, or attach them.

**`pwa: true`** registers a service worker for best-effort offline use.

## Overrides

| Flag | Effect |
|------|--------|
| `--lock` | force `externalSources: false`, whatever the profile |
| `--pwa` | force the service worker on |
| `--no-pwa` | force the service worker off |

`--profile bundled` already implies the lock, so `--lock` matters when you want a
`reader`-style build that still forbids adding sources.

## When to keep the PWA off

> [!WARNING]
> A service worker caches the app — including `docsets.json` and the books. After
> a deploy, returning visitors may keep reading a **stale offline copy** until the
> worker updates in the background. If your docs change often (or you deploy on
> every merge), pack with `--no-pwa` so every visit fetches the current site; turn
> the PWA on when offline reading is worth the update lag.
