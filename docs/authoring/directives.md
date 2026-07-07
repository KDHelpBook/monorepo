---
title: Directives
keywords: [directive, container, callout, card, note, tip, warning, block_directive]
categories: [blocks]
related: [callouts, blockquotes, code-blocks]
---

# Directives

A **directive** is a fenced container that wraps other Markdown in a labelled box.
Open with three or more colons and a name, then close with a matching row of colons:

```md
:::tip
You can nest **Markdown**, lists, and `code` inside a directive.
:::
```

The compiler turns `:::name … :::` into `<div class="name">` (comrak's
`block_directive` extension), and the viewer styles a curated set of names. The name is
HTML-escaped when it becomes the class, so directive content can't inject markup.

## Callout directives

Five names render as coloured, self-labelling callouts — a portable alternative to the
`> [!NOTE]` [callout](callouts) syntax:

```md
:::note
Background a reader can skip.
:::

:::warning
Something that can bite you.
:::
```

Renders as:

:::note
Background a reader can skip.
:::

:::tip
A shortcut worth knowing.
:::

:::info
A neutral aside.
:::

:::warning
Something that can bite you.
:::

:::caution
A destructive or irreversible action.
:::

The available kinds are `note`, `tip`, `info`, `warning`, and `caution` (`danger` is an
alias for `caution`). Each supplies its own heading — the type *is* the label.

## Cards

`:::card` is a plain framed box with no accent bar and no auto-heading — reach for it
when you want to set a block apart without implying note/warning semantics:

```md
:::card
A self-contained block: a summary, a definition, a call-out box of your own making.
:::
```

Renders as:

:::card
A self-contained block: a summary, a definition, a call-out box of your own making.
:::

## Tabs

`:::tabs` wraps a set of `:::tab` panels — one shown at a time, switched by clicking its
label. The words after `tab` are the label; a panel holds any Markdown (prose, code,
even another directive). Give the outer `tabs` fence more colons than the inner `tab`s:

```md
::::tabs
:::tab macOS
Install with Homebrew:

`brew install foo`{:bash}
:::
:::tab Linux
`apt install foo`{:bash}
:::
::::
```

Renders as an interactive tab strip:

::::tabs
:::tab macOS
Install with Homebrew: `brew install foo`{:bash}
:::
:::tab Linux
`apt install foo`{:bash}
:::
::::

Tabs are the one directive that needs the viewer's frame bridge (a tiny click handler);
everything else on this page is pure CSS. A `tab` with no label falls back to `Tab 1`,
`Tab 2`, …

## Steps

`:::steps` turns an **ordered list** into a numbered walkthrough — big numerals down a
connector line, with room for rich content under each step:

```md
:::steps
1. **Install** the CLI.

   `cargo install khb`{:bash}

2. **Compile** your sources into a `.khb`.

3. **Open** it in the viewer.
:::
```

Renders as:

:::steps
1. **Install** the CLI. `cargo install khb`{:bash}
2. **Compile** your sources into a `.khb`.
3. **Open** it in the viewer.
:::

## Nesting

To put a directive inside another, give the **outer** fence more colons than the inner
one:

```md
::::card
A card with a callout inside it:

:::tip
Nested with three colons; the card uses four.
:::
::::
```

## Notes for KD Help Book

- The name becomes the box's `class` verbatim — a name outside the styled set above
  (`:::sidebar`, say) renders as an unstyled `<div>`. There's no attribute or custom-title
  syntax: `:::note Heading` doesn't set a heading, it just adds stray classes.
- Callout directives and `> [!NOTE]` callouts are interchangeable; use whichever reads
  better in the source. Both compile to the same kind of box.
- `:::tabs` here is for **prose** panels; to tab between *code* samples with real syntax
  highlighting use [`~~~code-group`](code-blocks) instead. Collapsible code isn't a
  directive either — it's the `collapse` fence flag.
