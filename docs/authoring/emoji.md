---
title: Emoji
keywords: [emoji, shortcodes, unicode, icons, symbols]
categories: [markdown]
related: [text-formatting, headings]
---

# Emoji

Write emoji with `:shortcode:` names — the compiler replaces them with the Unicode
character at build time.

```md
Shipped it :tada: — tests are green :white_check_mark:.
```

Renders as: Shipped it :tada: — tests are green :white_check_mark:.

## Notes for KD Help Book

- Any standard emoji shortcode works (`:rocket:`, `:warning:`, `:bulb:`, …); an
  unknown `:name:` is left as literal text.
