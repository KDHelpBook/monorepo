---
title: Kategorie
keywords: [kategorie, facet, tagi, filtr]
categories: [authoring, reference]
---
# Kategorie

Kategorie to **facet** — etykiety przecinające drzewo spisu treści. Strona może
należeć do wielu kategorii, niezależnie od miejsca w drzewie.

Zadeklaruj je w `categories.yaml`:

```yaml
- id: basics
  title: Pierwsze kroki
- id: reference
  title: Materiały referencyjne
```

…a następnie oznacz strony we frontmatterze: `categories: [basics, reference]`.
Przeglądarka używa ich do zawężania drzewa i przeglądania po temacie — jak filtry
kolekcji w klasycznym desktopowym czytniku pomocy.
