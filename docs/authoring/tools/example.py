#!/usr/bin/env python3
"""ext:example — write a doc example once, get the `code-preview example` widget.

The bundled `~~~code-preview example` widget pairs a *source* block (shown as code) with a
*result* block (rendered) — so authors normally write the same snippet twice. This
extension takes the snippet **once** (the block body) and emits that widget with the body
filled into both halves, killing the duplication.

`meta` may carry a source language (default `md`) and/or `split` (source + result side by
side), in any order — e.g. `split`, `rust`, or `rust split`. Because extensions run before
the widget chain, the emitted `~~~code-preview` is expanded normally afterwards.
"""
import json
import re
import sys


def fence(ch: str, text: str, minimum: int = 3) -> str:
    """A run of `ch` long enough to wrap `text` (one longer than any run inside it)."""
    longest = max((len(m.group()) for m in re.finditer(re.escape(ch) + "+", text)), default=0)
    return ch * max(minimum, longest + 1)


req = json.load(sys.stdin)
body = req["body"].rstrip("\n")
opts = req["meta"].split()
skin = "example split" if "split" in opts else "example"
lang = next((o for o in opts if o != "split"), "md")

bt = fence("`", body)          # inner code fences, sized to the body
td = fence("~", bt + body)     # outer fence, longer than any tilde run inside
markdown = (
    f"{td}code-preview {skin}\n"
    f"{bt}{lang}\n{body}\n{bt}\n"  # source, shown as code
    f"{bt}md\n{body}\n{bt}\n"      # result, rendered as Markdown
    f"{td}\n"
)
json.dump({"markdown": markdown}, sys.stdout)
