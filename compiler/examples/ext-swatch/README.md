# ext-swatch — example compiler extension

A minimal, runnable [extension](../../../docs/authoring/extensions.md): `swatch.py` turns a
` ```ext:swatch ` block of `Name: #hex` lines into a Markdown table with a generated SVG
colour swatch per entry.

```sh
khb compile examples/ext-swatch -o swatch.khb --allow-extensions
```

Extensions are opt-in: without `--allow-extensions` the block is left as a plain code block
and the external tool is never run.
