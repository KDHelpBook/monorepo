---
title: Security model
keywords: [security, sandbox, iframe, postMessage, untrusted, origin, bridge]
categories: [internals, security]
related: [file-formats, building-a-compiler, khb-publishing:hosting]
---

# Security model

A `.khb` can come from anywhere — a user opens, uploads or streams one — so every
stored `body_html` is treated as **untrusted**. The viewer's answer is origin
isolation, not sanitization. `docs/format.md` §Security is the normative
description.

## The boundary: a sandboxed frame without `allow-same-origin`

Every page body renders in a sandboxed `iframe` with `sandbox="allow-scripts"` —
crucially **without** `allow-same-origin` — so the frame is an isolated, opaque
origin. That origin isolation (not script-blocking) is the security boundary:

- Untrusted JS **may run**, but in a different origin it cannot reach the app: no
  parent DOM, no `localStorage`, no access to the IndexedDB where other docsets
  live. Content CSS is confined to the frame and can't spoof the app chrome.
- The frame gets **no other sandbox tokens** — no popups, modals, forms or
  top-navigation — so hostile content can't even navigate away or open a window.

> [!IMPORTANT]
> The model deliberately does *not* rely on stripping scripts from stored HTML.
> Sanitizers are a moving target; an opaque origin is a browser-enforced wall. A
> malicious book gets a JavaScript playpen with nothing in it.

App-generated UI (the Search page) renders in the normal document, never in the
frame — it is trusted output of the app itself.

## The bridge: one narrow, validated channel

A small **trusted bridge** injected into the frame is the *only* channel across
the boundary. Outbound, it `postMessage`s **link intents** — open a page id, or
open an external URL, carrying the click's modifier keys so the app can honour
"open in new tab" — plus scroll state (and scrolls the first search hit into
view). Inbound, it accepts display-only messages such as font size.

The app side treats every inbound message as hostile:

| Check | Effect |
|-------|--------|
| Source | the message must come from the content frame itself |
| Shape | only known message shapes (`open`, `ext`, …) are accepted |
| Safe-by-design actions | an `open` just routes — an unknown id shows "not found"; `ext` only opens vetted URL schemes |

Nothing the frame can say makes the app execute content-controlled code; the worst
a message can do is navigate to a page or be ignored.

## Assets and links

- Attachments are inlined as **`data:` URLs**, so they are self-contained and load
  inside the isolated frame without granting it any network identity.
- External fetches from content are effectively blocked: the frame has no origin
  to make credentialed requests from, and the app never proxies for it — a
  hostile book can't exfiltrate through the app or phone home with the reader's
  credentials.
- `javascript:` and other unknown link schemes are stripped when rendering.

## Defence in depth from the compiler

The bundled compiler renders Markdown with **raw HTML escaped**, so first-party
docsets contain no markup that would ever need neutralising. This is a courtesy,
not the boundary — the sandbox assumes third-party compilers (see
[Building a compiler](building-a-compiler)) may emit arbitrary HTML, and holds
regardless.
