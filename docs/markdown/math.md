---
title: Math
keywords: [math, latex, mathml, equations, formulas]
categories: [blocks]
related: [code-blocks, text-formatting]
---

# Math

Write LaTeX math between dollar signs. It is converted to **MathML at build time**, so
the browser renders it natively — no KaTeX or MathJax at runtime (comrak's
`math_dollars` extension + a LaTeX→MathML pass).

Inline math uses single `$…$`:

```md
The relation $E = mc^2$ links mass and energy.
```

The relation $E = mc^2$ links mass and energy.

Display math (its own centred block) uses `$$…$$`:

```md
$$\int_0^1 x^2 \, dx = \frac{1}{3}$$
```

$$\int_0^1 x^2 \, dx = \frac{1}{3}$$

## Notes for KD Help Book

- A formula the converter can't parse **fails the build** (with the page id and the
  offending LaTeX), rather than silently degrading to raw text — a broken equation is a
  content bug worth catching at compile time.
- MathML is stored in the page, so math works offline and needs no scripts in the
  sandboxed content frame.
