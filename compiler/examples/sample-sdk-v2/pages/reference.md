---
title: API Reference
keywords: [api, connect, sendAsync, send]
categories: [reference]
---
# API Reference (2.0)

## `connect(url)`
Opens a connection and returns a `Client`.

## `Client.sendAsync(message)`
Sends a message and returns a `Promise` that resolves when the peer acknowledges
delivery. **Preferred** over `send()`.

## `Client.send(message)` — deprecated
Kept for 1.0 compatibility; prefer `sendAsync()`.
