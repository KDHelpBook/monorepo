---
title: Czym jest docset .khb?
keywords: [.khb, docset, SQLite, FTS5, format, .khbc, .khbb, .khba, załączniki, zasoby]
categories: [basics, reference]
---
# Czym jest docset .khb?

Plik `.khb` to zwykła baza **SQLite**, która przechowuje wszystko, czego
potrzebuje przeglądarka — policzone z góry:

![Jak powstaje docset](assets/khb-pipeline.svg)

| Tabela | Rola |
|--------|------|
| `pages` | wyrenderowany HTML + czysty tekst każdej strony |
| `toc` | drzewo spisu treści |
| `categories`, `page_categories` | facet kategorii |
| `keywords` | indeks słów kluczowych (F1) |
| `pages_fts` | indeks wyszukiwania pełnotekstowego (FTS5) |
| `assets` | osadzone obrazy i załączniki do pobrania |

Ponieważ indeks jest gotowy, wyszukiwanie jest natychmiastowe i działa offline.

## Warianty transportu

Istnieją dwa mniejsze warianty do dystrybucji:

- **`.khbc`** — `.khb` skompresowany gzipem, rozpakowywany w przeglądarce.
- **`.khbb`** — minimalny binarny bez indeksów; przeglądarka odbudowuje z niego
  `.khb` (przez WebAssembly) i zapisuje wynik w pamięci podręcznej.

## Załączniki

Obrazy i pliki do pobrania są w tabeli `assets` — albo **osadzone** w `.khb`,
albo w jednym lub kilku plikach obok, **`.khba`**. Tak czy inaczej bajty pozostają
w samowystarczalnym kontenerze SQLite, więc docset działa offline i po wgraniu.
Zwięzłe podsumowanie znajdziesz w [ściądze do pobrania](assets/quick-reference.txt).

Format jest **niezależny od formatu źródłowego**: `.khb` przechowuje gotowy HTML,
nigdy Markdown, więc kompilator dowolnego formatu wejściowego może go wytworzyć.
