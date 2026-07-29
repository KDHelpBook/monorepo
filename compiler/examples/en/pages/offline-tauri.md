---
title: Offline desktop app (Tauri)
keywords: [Tauri, desktop, offline, native, WebView]
categories: [distribution, reference]
---
# Offline desktop app (Tauri)

KD Help Book does not currently ship a desktop application. A **Tauri** wrapper
is a possible future integration for a native window and menus.

The proposed design would reuse the viewer UI and expose the native Rust `core`
engine through Tauri commands so `.khb` docsets can be read directly from disk.

| Option | Upside | Note |
|--------|--------|------|
| **Tauri** | tiny bundle, native menus | needs Rust to build |
| **Electron** | ubiquitous Chromium | heavier bundle |

This is a design direction, not an available release artifact.
