---
title: Offline desktop app (Tauri)
keywords: [Tauri, desktop, offline, native, WebView]
categories: [distribution, reference]
---
# Offline desktop app (Tauri)

Want a real desktop application with a native window and menus, like the original
`dexplore.exe`? Wrap the same viewer in **Tauri**.

Because the entire data engine is a Rust crate that also compiles natively, Tauri
reads `.khb` docsets straight from disk with native SQLite — no WebAssembly and no
network needed. The content is fully offline by definition.

| Option | Upside | Note |
|--------|--------|------|
| **Tauri** | tiny bundle, native menus | needs Rust to build |
| **Electron** | ubiquitous Chromium | heavier bundle |

Tauri is the closest to the spirit of a lightweight help reader.
