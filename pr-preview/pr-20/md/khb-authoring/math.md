
# Math

Write LaTeX math between dollar signs. It is converted to **MathML at build time**, so
the browser renders it natively — no KaTeX or MathJax at runtime.

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

## Code-fence syntax

If your text has literal `$` (currency), the **code syntax** avoids ambiguity — inline
`` $`…`$ `` and a ` ```math ` block. Both convert to the same MathML:

````md
Inline: $`a^2 + b^2 = c^2`$

```math
\sum_{k=1}^n k = \frac{n(n+1)}{2}
```
````

Inline: $`a^2 + b^2 = c^2`$

```math
\sum_{k=1}^n k = \frac{n(n+1)}{2}
```

A formula the converter can't parse **fails the build** (with the page id and the
offending LaTeX), rather than silently degrading to raw text — a broken equation is a
content bug worth catching at compile time. MathML is stored in the page, so math works
offline and needs no scripts in the sandboxed content frame.
