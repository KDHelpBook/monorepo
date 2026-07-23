#!/usr/bin/env python3
"""khb-swatch — a tiny example khb extension.

Turns a block of `Name: #rrggbb` lines into a Markdown table with a generated SVG colour
swatch per entry. Demonstrates the extension protocol (docs/authoring/extensions.md): read
a JSON request on stdin, write generated assets into `assets_dir`, and return
`{ "markdown": ..., "assets": [...] }` on stdout. Any executable in any language works —
this one is Python.
"""
import json
import os
import re
import sys

req = json.load(sys.stdin)
rows, assets = [], []
for i, line in enumerate(l for l in req["body"].splitlines() if l.strip()):
    m = re.match(r"\s*(.+?)\s*[:=]\s*(#[0-9a-fA-F]{3,8})\s*$", line)
    if not m:
        sys.exit(f"swatch: cannot parse line {line!r} (expected `Name: #hex`)")
    name, color = m.group(1), m.group(2)
    file = f"swatch-{i}.svg"
    with open(os.path.join(req["assets_dir"], file), "w") as f:
        f.write(
            "<svg xmlns='http://www.w3.org/2000/svg' width='48' height='24'>"
            f"<rect width='48' height='24' rx='4' fill='{color}'/></svg>"
        )
    assets.append({"file": file})
    rows.append(f"| {name} | ![{name}]({req['asset_prefix']}{file}) | `{color}` |")

json.dump(
    {
        "markdown": "| Colour | Swatch | Hex |\n|---|---|---|\n" + "\n".join(rows) + "\n",
        "assets": assets,
    },
    sys.stdout,
)
