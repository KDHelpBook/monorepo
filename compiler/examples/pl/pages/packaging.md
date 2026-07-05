---
title: Pakowanie
keywords: [pack, pakowanie, publikacja, GitHub Pages, hosting, manifest]
categories: [distribution]
---
# Pakowanie

`kdhelp pack` składa gotową do hostingu dystrybucję statyczną: kopiuje
przeglądarkę, dokłada obok Twoje docsety i zapisuje manifest `docsets.json`,
który przeglądarka wczytuje przy starcie.

```bash
kdhelp pack --viewer viewer-ts/dist \
            --docset docs.khb \
            --profile reader \
            -o publish/
```

Dwa **profile** kształtują wynik:

| Profil | Źródła zewnętrzne | PWA | Zastosowanie |
|--------|-------------------|-----|--------------|
| `reader` | wł. | wł. | ogólny czytnik; użytkownik może otwierać inne docsety |
| `bundled --lock` | wył. | wył. | dokumentacja jednego produktu, zablokowana |

`kdhelp patch` dokłada lub podmienia docsety w gotowej dystrybucji bez
przebudowy przeglądarki. Wynik hostujesz na dowolnym hostingu statycznym, np.
GitHub Pages.
