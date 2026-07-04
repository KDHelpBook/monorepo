# Handoff — Eksplorator dokumentów (przeglądarka dokumentacji w stylu MS Help 2.x)

Dokument przekazania projektu dla Claude Code (lub innego programisty). Opisuje, czym jest projekt, jak jest zbudowany, jakich konwencji się trzymać, na co uważać i co robić dalej.

> **Jeden plik do zapamiętania:** `help-viewer.html` (~1190 linii). Cała aplikacja — HTML, CSS, JS i treść — mieści się w tym jednym pliku. Nie ma builda, zależności instalowanych lokalnie ani backendu.

---

## 1. Czym jest ten projekt

To samowystarczalna, lokalna **przeglądarka dokumentacji** odtwarzająca wygląd i sposób działania **Microsoft Document Explorer** (`dexplore.exe`) — aplikacji, która serwowała *MSDN Library* dla Visual Studio 2008. Chrom jest z epoki (niebieski pasek tytułu, srebrny toolbar, zakładki Spis treści / Indeks / Ulubione, pasek adresu `ms-help://`), ale silnik treści jest nowoczesny: **treść pisze się w Markdown**, a przeglądarka sama zapewnia drzewo spisu treści, indeks słów kluczowych w stylu F1, wyszukiwarkę pełnotekstową offline, ulubione oraz karty.

**Cel projektu:** dać jednoplikowy, przenośny czytnik dokumentacji, który:
- działa lokalnie (dwuklik) oraz po wystawieniu na statyczny hosting,
- da się później owinąć w aplikację desktopową (Tauri / WebView2 / Electron) bez zmian w treści,
- odwzorowuje „feel" MS Help 2 (a nie wygląda jak generyczna nowoczesna witryna docs).

Treść zaszyta w demo to **dokumentacja samej przeglądarki** (21 stron w pięciu sekcjach) — służy jako działający przykład i jednocześnie instrukcja.

---

## 2. Szybki start

```bash
# Podgląd: po prostu otwórz plik w przeglądarce
open help-viewer.html          # macOS
xdg-open help-viewer.html      # Linux

# Jeśli kiedykolwiek rozbijesz treść na zewnętrzne pliki .md (fetch),
# potrzebny będzie serwer HTTP (fetch nie działa z file://):
python -m http.server 8080     # -> http://localhost:8080/help-viewer.html
```

Brak kroku kompilacji. Jedyna zależność zewnętrzna to biblioteka **marked** ładowana z CDN (patrz niżej).

---

## 3. Struktura pliku

Kolejność w `help-viewer.html`:

1. `<meta>` / `<title>` — nagłówek; **brak jawnego `<html>`/`<body>`** (przeglądarka i host podglądu je dodają — patrz pułapki).
2. `<style>` — cały CSS. Na górze **zmienne CSS** (paleta VS 2008, fonty), potem reguły chromu, paneli, kart, i na końcu `@media` dla wąskiego ekranu.
3. Chrom HTML — `.window` z paskiem tytułu, menu, toolbarem, obszarem `.body` (lewy panel + splitter + prawy panel) i paskiem stanu; plus modal „O programie".
4. Bloki treści — `<script type="text/markdown" data-page="ID">…</script>`, po jednym na stronę.
5. `<script src="…marked…">` — biblioteka Markdown z CDN.
6. `<script>` — cała logika w jednym IIFE (`(function(){ … })()`).

---

## 4. Architektura

### 4.1 Model treści: `TREE` + bloki Markdown

Źródłem prawdy o strukturze jest tablica **`TREE`** (na początku logicznego `<script>`). Węzeł:

```js
{
  id:       "unikalne-id",     // wymagane; zarazem adres strony (#id)
  title:    "Tytuł w drzewie", // wymagane
  keywords: ["słowo", "…"],    // opcjonalne; trafiają do indeksu
  children: [ /* węzły */ ]    // opcjonalne; poddrzewo
}
```

Kolejność w tablicy = kolejność w drzewie. Węzeł-sekcja (z `children`) może mieć własną treść — działa wtedy jak strona-wstęp (odpowiednik „folderu z landing page" w MS Help 2).

Treść każdej strony leży w osobnym bloku `<script type="text/markdown" data-page="ID">` o zgodnym `id`. Backticki i potrójne backticki są w tych blokach bezpieczne (to surowy tekst, nie kod JS).

### 4.2 Struktury pochodne (budowane raz przy starcie)

- **`PAGES`** — `Map(id → { id, title, keywords, path[], hasChildren })`. `path` to lista przodków (stąd okruszki i auto-rozwijanie drzewa).
- **`KEYWORDS`** — `Map(słowo → Set(id))` na potrzeby zakładki Indeks.
- **`MD`** — `Map(id → surowy markdown)` pobrany z bloków `<script>`.
- **`PLAIN`** — leniwy cache czystego tekstu strony (markdown → HTML → `textContent`) dla wyszukiwarki.

### 4.3 Renderowanie treści

- Markdown → HTML robi **marked 4.3.0** (`marked.parse`). Jeśli marked się nie załaduje, jest **fallback**: tytuł + surowy markdown w `<pre>` (kod tego pilnuje: `window.marked ? … : …`).
- **`decorate(html, page)`** — po renderze: zamienia kursywę tuż pod `H1` na podtytuł (`.sub`) i dokleja stopkę ze słowami kluczowymi.

### 4.4 Karty i nawigacja

Stan kart: `tabs = [{id}]` oraz `active` (indeks). Kluczowe funkcje:

- **`openPage(id, newTab)`** — jedyne „wejście" do nawigacji. `newTab` (lub brak kart) → nowa karta; inaczej podmienia stronę w aktywnej karcie. Na wąskim ekranie zamyka szufladę.
- **`loadContent(id)`** — samo wczytanie treści + aktualizacja chromu (tytuł okna, adres, drzewo, hash, przycisk Ulubione). **Nie** zarządza kartami.
- **`renderTabs()`** — przerysowuje pasek kart; obsługuje aktywację (`activateTab`) i zamykanie (`closeTab`, z zachowaniem ≥1 karty).
- **`linkOpen(el, id)`** — wpina element tak, że zwykły klik = ta sama karta, a **Ctrl/⌘-klik lub środkowy przycisk = nowa karta**. Używane w drzewie, indeksie, wynikach, ulubionych i (delegowane) w linkach wewnątrz treści.

### 4.5 Lewy panel: tryby i zwijanie

- **`setMode(mode)`** — przełącza zawartość lewego panelu: `contents` | `index` | `search` | `favorites` (renderuje drzewo/indeks/wyszukiwarkę/ulubione, pokazuje/ukrywa filtr i pole szukania).
- **`showMode(mode)`** — `expand()` + `setMode(mode)`; używane przez toolbar, dolne zakładki i pasek boczny (zawsze rozwija panel).
- **Zwijanie:** klasa **`is-collapsed`** na `.window`. Gdy ustawiona: panel schowany, splitter schowany, pokazany pionowy **pasek boczny `#left-strip`** (ikony trybów). `collapse()` / `expand()` dodają/zdejmują tę klasę. Pinezka i `×` zwijają; ikony paska i przycisk toolbaru rozwijają.
- **Wąski ekran (≤ 640 px):** ten sam `is-collapsed`, ale panel staje się **szufladą nasuwaną z lewej** na całą wysokość, z przyciemnieniem tła (`#scrim`). Przełącznik `☰` otwiera/zamyka; wybór tematu lub klik w tło zamyka.

### 4.6 Routing i pasek adresu

- Adres to **hash** w URL-u (`#id`) — strony są linkowalne i współpracują z Wstecz/Dalej przeglądarki (przyciski wołają `history.back()/forward()`).
- `loadContent` ustawia `location.hash`; `hashchange` woła `openPage(id, false)` tylko gdy `id !== currentId` (brak pętli).
- Pasek **Adres** pokazuje `ms-help://LOCAL.Docs/{id}.htm`; Enter parsuje `id` i nawiguje.

### 4.7 Pozostałe elementy

- **Ulubione** — `Set` w pamięci sesji (patrz pułapki: brak trwałości w podglądzie).
- **Filtr „Filtruj wg"** — zawęża drzewo do jednej gałęzi najwyższego poziomu.
- **Rozmiar czcionki** — `A▲/A▼` ustawiają `--content-size` na kontenerze treści.
- **Splitter** — przeciąganie zmienia szerokość lewego panelu (mousedown/mousemove).
- **Modal „O programie"** — otwierany ikoną `?` na pasku tytułu.

---

## 5. Konwencje kodu

- **Vanilla JS, bez frameworka.** Cała logika w jednym IIFE; brak zmiennych globalnych poza `window.*` używanym świadomie.
- **Deklaracje funkcji (hoisting).** Funkcje wołają się nawzajem niezależnie od kolejności w pliku — korzystaj z tego zamiast wprowadzać zależności kolejnościowe.
- **Delegacja / małe handlery.** Klik w linki treści jest delegowany na `#content`; elementy list wpinane przez `linkOpen`.
- **CSS:** kolory i fonty przez **zmienne** (`:root`); klasy semantyczne; wcięcia 2 spacje; komentarze po polsku. Uwaga na specyficzność selektorów (łatwo o kolizje marginesów między `.klasa` a selektorem elementu).
- **Język:** UI **i** treść po polsku; identyfikatory w kodzie po angielsku. Sortowanie indeksu używa `localeCompare('pl')` — nie zamieniaj na zwykłe `sort()`.

---

## 6. Krytyczne ograniczenia i pułapki — PRZECZYTAJ PRZED ZMIANAMI

Te rzeczy zostały odkryte „po drodze" i łatwo je nieświadomie zepsuć:

1. **Jeden plik, zero builda.** Nie wprowadzaj bundlera ani `node_modules` do artefaktu. Markdown renderuje **marked z cdnjs** (`marked/4.3.0/marked.min.js`); zawsze zostaw fallback na wypadek braku sieci.

2. **BRAK `localStorage` / `sessionStorage` w podglądzie artefaktów Claude.** W tym środowisku dostęp do storage rzuca wyjątek i psuje aplikację, dlatego **ulubione są w pamięci sesji**. Trwałość dodawaj tak, by nie wywalała podglądu — najlepiej `try/catch` wokół storage albo tylko w trybie uruchomienia samodzielnego (poza podglądem, np. jako plik `file://` lub na własnym hostingu, gdzie `localStorage` działa normalnie).

3. **Host podglądu przetwarza źródło HTML.** Owija stronę we własny `<body id="artifacts-component-root-html">` i **przepisuje literalny token `<body>`** znaleziony w źródle (dlatego w przykładzie w treści nie może być dosłownego `<body>`). Dodatkowo — jak w każdym HTML — **literalny `</script>` w bloku `text/markdown` zamknąłby ten blok**; w treści zapisujemy go jako `<\/script>`. Zasada: w treści Markdown unikaj dosłownego `<body>` i escapuj `<\/script>`.

4. **Okno używa `position: fixed; inset: 0`** (a nie `height:100%`). Powód: w podglądzie host nadpisuje wysokość `body`, a łańcuch `html→body→.window` przez `height:100%` się rozjeżdżał i treść przestawała się przewijać. **Nie wracaj** do `height:100%` na `.window`.

5. **`min-width: 0` na panelach flex** (`.body`, `.pane`, `.content-wrap`, input adresu). Bez tego prawy panel nie zwęża się poniżej „naturalnej" szerokości długich linii kodu w `<pre>` i **treść ucieka poza prawą krawędź** (jest obcinana). Długie linie kodu mają się przewijać w obrębie `<pre>`, nie rozpychać panelu.

6. **Breakpoint responsywny = 640 px.** Poniżej: szuflada + `#scrim`. **`matchMedia` w JS musi być zsynchronizowany z `@media` w CSS** (obecnie oba `max-width:640px`). Jeśli zmieniasz próg, zmień w obu miejscach.

---

## 7. Jak dodać / edytować treść

Dwa kroki (opisane też w samej aplikacji, na stronie „Dodawanie własnej treści"):

1. **Zarejestruj stronę** w `TREE` (dodaj węzeł `{ id, title, keywords }`, ewentualnie w `children`).
2. **Dopisz treść** — blok `<script type="text/markdown" data-page="TWOJE-ID">` z Markdownem. Zamykający znacznik w przykładach zapisuj jako `<\/script>`, żeby nie przerwać parsowania.

Odświeżenie pliku wystarczy — strona pojawia się w drzewie, indeksie i wyszukiwarce.

---

## 8. Testowanie

**Ręczna checklista (w przeglądarce):**
- drzewo: rozwijanie/zwijanie gałęzi, kliknięcie tematu, auto-rozwijanie ścieżki, „Zsynchronizuj";
- indeks: sortowanie z polskimi znakami, hasło wskazujące wiele tematów (rozwijana lista);
- wyszukiwarka: trafienia z fragmentem i podświetleniem;
- karty: zwykły klik (ta sama karta), Ctrl/⌘/środkowy przycisk (nowa karta), `＋`, zamykanie, przełączanie;
- zwijanie: pinezka/`×` → pasek boczny → ikona rozwija;
- wąski ekran (< 640 px): `☰` otwiera szufladę, wybór tematu / klik w tło zamyka;
- pasek adresu (Enter), Wstecz/Dalej, rozmiar czcionki, splitter, modal „O programie".

**Szybki smoke test bez przeglądarki (jsdom).** marked nie jest pobierany przez jsdom, więc podmieniamy go zaślepką; podmieniamy też `scrollIntoView` i `matchMedia`:

```js
// npm i jsdom  ;  node test.mjs
import { JSDOM } from 'jsdom';
import fs from 'fs';
const html = fs.readFileSync('help-viewer.html','utf8');
const errors = [];
const dom = new JSDOM(html, { runScripts:'dangerously', pretendToBeVisual:true,
  beforeParse(w){
    w.matchMedia = q => ({ matches:/max-width:640px/.test(q), addEventListener(){}, removeEventListener(){} });
    w.HTMLElement.prototype.scrollIntoView = function(){};
    w.marked = { parse: md => md
      .replace(/^# (.+)$/m,'<h1>$1</h1>')
      .replace(/\[([^\]]+)\]\(#([^)]+)\)/g,'<a href="#$2">$1</a>') };
    w.onerror = m => errors.push(String(m));
  }
});
const { document:doc } = dom.window;
const $ = s => doc.querySelector(s);
setTimeout(() => {
  // np.: sprawdź, że wystartowała jedna karta i brak błędów
  console.log('karty:', $('#tabstrip').children.length);
  console.log(errors.length ? errors : 'OK');
}, 200);
```

> Uwaga: `matches:true` powyżej symuluje **wąski** ekran (test szuflady). Ustaw `matches:false`, by testować układ dwupanelowy.

---

## 9. Znane ograniczenia

- **Ulubione nie są utrwalane** (pamięć sesji) — patrz pułapka #2.
- **Historia jest globalna, nie per-karta.** Wstecz/Dalej działają na wspólnej historii hasza i ładują do aktywnej karty. Prawdziwa historia per-karta wymagałaby własnego stosu na kartę.
- **Bardzo szerokie tabele** w treści mogą wywoływać poziomy pasek przewijania całego panelu (kod nie zawija ani nie przewija ich lokalnie).
- **Brak realnego F1 / integracji z kontekstem** (to tylko odpowiednik indeksu w UI).
- **Treść trzymana w blokach `<script>`**, nie w osobnych plikach `.md` (świadomie, dla jednoplikowości).

---

## 10. Propozycje dalszych kroków (roadmap)

Uporządkowane od najprostszych; przy każdym wskazane, gdzie w kodzie zaglądać:

1. **Trwałe ulubione** (tryb samodzielny): czytaj/zapisuj `favorites` do `localStorage` w `try/catch`. Miejsce: handler przycisku Ulubione + `renderFavorites`/`updateFavBtn` + inicjalizacja.
2. **Treść z osobnych plików `.md` przez `fetch`**: zamiast bloków `<script>` wczytuj markdown na żądanie w `loadContent` (wymaga serwowania przez HTTP). Miejsce: budowa `MD` / `loadContent`.
3. **Mocniejsza wyszukiwarka** dla dużych zbiorów: podmień `runSearch`/`plainOf` na **Pagefind** (statyczny indeks, świetny offline) lub **FlexSearch**.
4. **Powłoka desktopowa**: owiń plik w **Tauri** (najlżejsze), **WebView2** (Windows/.NET) lub **Electron**; dodaj natywne menu i globalny skrót **F1**.
5. **Historia per-karta**: rozbuduj model `tabs` o stos historii i wskaźnik na kartę; przepnij Wstecz/Dalej na ten stos zamiast na `history`.
6. **Skróty klawiszowe**: F1 (fokus indeksu / pomoc kontekstowa), Ctrl+F (fokus wyszukiwarki), Ctrl+W (zamknij kartę).
7. **Szerokie tabele**: zawijanie lub własne przewijanie w kontenerze tabeli w `.content`.
8. **Druk / eksport** bieżącej strony lub całości do PDF.

---

## 11. Uwaga o `CLAUDE.md`

Claude Code automatycznie wczytuje plik `CLAUDE.md` z katalogu projektu jako kontekst. Jeśli chcesz, by ten handoff był podawany automatycznie, zmień nazwę na `CLAUDE.md` (albo dołącz jego skrót). Warto wtedy dopisać na górze jedno-dwa zdania o bieżącym zadaniu, którym się zajmujesz.
