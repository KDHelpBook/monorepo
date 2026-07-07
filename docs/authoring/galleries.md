---
title: Galleries
keywords: [gallery, image strip, screenshots, tiles, caption, steps, ~~~gallery]
categories: [markdown]
related: [images, code-extensions, diagrams]
---

# Galleries

A `~~~gallery` fence lays a set of images out as **uniform captioned tiles** — the natural
home for a step-by-step screenshot strip. Each image is one tile, its alt text is the
caption, and identical images all render at the same width (no cell-by-cell squeezing the
way a table of images gives you).

    ~~~gallery
    ![1. Waiting for the card](assets/step-wait.png)
    ![2. Scanning](assets/step-scan.png)
    ![3. Write confirmed](assets/step-done.png)
    ~~~

Each `![alt](src)` on its own line starts a tile; the alt is shown as the caption beneath
the image.

## Descriptions

Any text on the lines **after** an image — up to the next image or the closing fence —
becomes that tile's description, shown smaller and muted under the caption. Only inline
Markdown (bold, code, links) is used, and it wraps within the tile:

    ~~~gallery
    ![1. Waiting for the card](assets/step-wait.png)
    Tap the card — its **UID** appears.

    ![2. Scanning](assets/step-scan.png)
    Exactly **one** tag may answer.
    ~~~

## Flags

Bare words in the fence info string tune the layout:

| Flag | Effect |
|------|--------|
| `w=<px>` | the shared tile width (e.g. `w=180`); defaults to a sensible width when omitted |
| `wrap` | **default** — tiles flow into more rows when the pane is narrow |
| `scroll` | keep a single row that scrolls sideways, preserving the step-strip order |

```md
~~~gallery w=180 scroll
![Idle](assets/a.png)
![Searching](assets/b.png)
![Paired](assets/c.png)
~~~
```

Use `wrap` for a loose set of images that can reflow, and `scroll` for an ordered
sequence you want kept in one line. In print, a `scroll` gallery wraps so nothing is
clipped.

## Notes

- **Clicking a tile** opens the full-size image in the lightbox, like any other image.
- **Captions are searchable** — the alt text feeds the page's plain-text index.
- A gallery with **no images** is a build error (the same rule the `~~~code-*` fences
  follow).
