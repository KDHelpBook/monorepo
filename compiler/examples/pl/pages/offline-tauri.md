---
title: Aplikacja desktopowa (Tauri)
keywords: [Tauri, desktop, offline, natywne, WebView]
categories: [distribution, reference]
---
# Aplikacja desktopowa (Tauri)

Chcesz prawdziwą aplikację z natywnym oknem i menu, jak klasyczny desktopowy
czytnik pomocy? Owiń tę samą przeglądarkę w **Tauri**.

Ponieważ cały silnik danych to crate w Rust, który kompiluje się też natywnie,
Tauri czyta docsety `.khb` wprost z dysku, natywnym SQLite — bez WebAssembly
i bez sieci. Treść jest offline z definicji.

| Opcja | Zaleta | Uwaga |
|-------|--------|-------|
| **Tauri** | mała paczka, natywne menu | do builda potrzebny Rust |
| **Electron** | wszechobecny Chromium | cięższa paczka |

Tauri jest najbliższy duchowi lekkiego czytnika pomocy.
