---
title: Aplikacja desktopowa (Tauri)
keywords: [Tauri, desktop, offline, natywne, WebView]
categories: [distribution, reference]
---
# Aplikacja desktopowa (Tauri)

KD Help Book nie udostępnia jeszcze aplikacji desktopowej. Wrapper w **Tauri**
jest możliwą przyszłą integracją z natywnym oknem i menu.

Planowana architektura wykorzysta ten sam interfejs przeglądarki i udostępni
natywny silnik Rust `core` przez komendy Tauri, aby czytać `.khb` z dysku.

| Opcja | Zaleta | Uwaga |
|-------|--------|-------|
| **Tauri** | mała paczka, natywne menu | do builda potrzebny Rust |
| **Electron** | wszechobecny Chromium | cięższa paczka |

To kierunek rozwoju, a nie dostępny artefakt wydania.
