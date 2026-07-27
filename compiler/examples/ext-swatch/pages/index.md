---
title: Swatch extension demo
---

# Swatch extension demo

This page uses the bundled `swatch` extension (`swatch.py` in this folder). Each
`Name: #hex` line below is turned, at compile time, into a table row with a generated SVG
colour swatch.

```ext:swatch
Coral: #ff7f50
Teal: #008080
Slate: #334155
```

Compile it with:

```bash
khb compile examples/ext-swatch -o swatch.khb --allow-extensions
```

Without `--allow-extensions` the block above is left as a plain code block — the build
stays hermetic and never runs the external tool.
