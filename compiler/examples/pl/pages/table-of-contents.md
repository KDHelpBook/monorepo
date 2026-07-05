---
title: Spis treści
keywords: [spis treści, drzewo, nawigacja, hierarchia]
categories: [authoring]
---
# Spis treści

Drzewo po lewej powstaje z pliku `toc.yaml`, który zagnieżdża strony po `id`:

```yaml
- page: getting-started
  children:
    - page: what-is-khb
- page: authoring
  children:
    - page: writing-pages
```

Kolejność w pliku = kolejność w drzewie. Węzeł z dziećmi może mieć własną treść —
kliknięcie otwiera stronę-wstęp do sekcji.

Możesz też pominąć `toc.yaml` i pozwolić, by drzewo powstało ze struktury
katalogów (numeryczne prefiksy jak `3.reference/2.samples.md` ustalają kolejność,
jak w Docusaurus).
