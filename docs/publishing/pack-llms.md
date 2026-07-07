---
title: AI export (--llms)
keywords: [llms.txt, llms-full.txt, Markdown export, AI, agents, MCP]
categories: [packing, publishing]
related: [pack, distribution]
---

# AI export (--llms)

`--llms` writes, alongside the viewer, the [llms.txt](https://llmstxt.org/)
family — so language models and agents can read your documentation as plain
files instead of scraping a single-page app.

## What it emits

| File | Contents |
|------|----------|
| `llms.txt` | a link index: an `H1` title, a one-line summary, then one section per book listing every page as `- [title](md/…): description`, in TOC order |
| `llms-full.txt` | every page's Markdown inline (with provenance comments), for one-shot ingestion |
| `md/<docset>/<page>.md` | each page as clean Markdown, fetchable on its own |

## Where the Markdown comes from

The export uses each page's **original Markdown source** — the optional `md`
column a compiler may store (format v5). A docset that carries none falls back to
the page's plain text, so the export always works; it's just nicer with the real
source. Books compiled by the bundled `khb compile` carry it.

> [!NOTE]
> Nothing here is loaded by the viewer — these are extra static files sitting next
> to it. They are also written as plain text even under
> [`--mode compact`](pack-mode): they're meant to be fetched and read as-is.

## Why

A `.khb` is a SQLite database rendered by a client-side app — perfect for humans,
opaque to a crawler. The `--llms` export is the **static counterpart to a future
MCP server**: the same content as plain files any static host serves without a
backend, today.
