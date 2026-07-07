---
title: Emoji
keywords: [emoji, shortcodes, unicode]
categories: [inline]
related: [text-formatting, headings]
---

# Emoji

Write emoji with `:shortcode:` names — the compiler replaces them with the Unicode
character at build time (comrak's `shortcodes` extension, enabled).

```md
Shipped it :tada: — tests are green :white_check_mark:.
```

Renders as: Shipped it :tada: — tests are green :white_check_mark:.

## Notes for KD Help Book

- Any standard emoji shortcode works (`:rocket:`, `:warning:`, `:bulb:`, …); an
  unknown `:name:` is left as literal text.
- The stored plain-text (used for search) contains the emoji character, not the
  shortcode name.
