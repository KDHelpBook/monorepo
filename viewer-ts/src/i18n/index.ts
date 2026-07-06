// UI string tables. Content comes from the docsets (one per language); this is
// only the chrome. English is the fallback.

export type Lang = "en" | "pl";

export interface Strings {
  // menu
  menuFile: string;
  menuEdit: string;
  menuView: string;
  menuHelp: string;
  openDocset: string;
  print: string;
  find: string;
  sync: string;
  clearHighlight: string;
  largerText: string;
  smallerText: string;
  back: string;
  forward: string;
  about: string;
  share: string;
  linkCopied: string;
  refreshing: string;
  textSize: string;
  close: string;
  updateReady: string;
  updateReload: string;
  docsetUpdated: (title: string, from: string, to: string) => string;
  // modes / tabs
  contents: string;
  index: string;
  search: string;
  advancedSearch: string;
  favorites: string;
  // left panel
  filterLabel: string;
  filterAll: string;
  filterProduct: string;
  filterAllProducts: string;
  searchPlaceholder: string;
  searchPrompt: string;
  noResults: string;
  searchResults: (n: number) => string;
  indexKeywords: (n: number) => string;
  // full search page
  sortBy: string;
  sortRank: string;
  sortTitle: string;
  sortSource: string;
  scopeProduct: string;
  allProducts: string;
  sourceLabel: string;
  favEmpty1: string;
  favEmpty2: string;
  // right panel / misc
  addressLabel: string;
  favorite: string;
  newTab: string;
  showHidePanel: string;
  ready: string;
  keywordsLabel: string;
  seeAlso: string;
  notFoundTitle: string;
  notFoundBody: (id: string) => string;
  // about
  aboutTagline: string;
  aboutLanguage: string;
  languageLabel: string;
  // library
  manageDocsets: string;
  importManifest: string;
  importManifestTitle: string;
  importManifestHint: string;
  uploadedBadge: string;
  remoteBadge: string;
  packsLabel: string;
  chooseEdition: string;
  noDocsets: string;
  uploadedTitle: string;
  noUploaded: string;
  remove: string;
  uploadError: string;
  bundledBadge: string;
  // remote / online docsets
  openUrl: string;
  openUrlTitle: string;
  openUrlHint: string;
  openUrlChecking: string;
  openUrlError: string;
  add: string;
  cancel: string;
  remotesTitle: string;
  docsetLanguage: string;
  versionLabel: string;
  changeVersionLang: string;
  streamOption: string;
  streamHint: string;
  streamSidecars: string;
  streamingBadge: string;
}

const en: Strings = {
  menuFile: "File",
  menuEdit: "Edit",
  menuView: "View",
  menuHelp: "Help",
  openDocset: "Open docset…",
  print: "Print…",
  find: "Find on page…",
  sync: "Sync with Contents",
  clearHighlight: "Clear search highlight",
  largerText: "Larger text",
  smallerText: "Smaller text",
  back: "Back",
  forward: "Forward",
  about: "About kdhelp",
  share: "Share…",
  linkCopied: "Link copied",
  refreshing: "Refreshing…",
  textSize: "Text size",
  close: "Close",
  updateReady: "A new version is available.",
  updateReload: "Reload",
  docsetUpdated: (title, from, to) => `${title} updated: ${from} → ${to}`,
  contents: "Contents",
  index: "Index",
  search: "Search",
  advancedSearch: "Advanced search…",
  favorites: "Favorites",
  filterLabel: "Filter by category:",
  filterAll: "(all)",
  filterProduct: "Filter by product:",
  filterAllProducts: "(all products)",
  searchPlaceholder: "Type words to search…",
  searchPrompt: "Type words to search the documentation.",
  noResults: "No results for:",
  searchResults: (n) => `${n} result${n === 1 ? "" : "s"}`,
  indexKeywords: (n) => `${n} keyword${n === 1 ? "" : "s"}`,
  sortBy: "Sort by:",
  sortRank: "Rank",
  sortTitle: "Title",
  sortSource: "Source",
  scopeProduct: "Product:",
  allProducts: "(all products)",
  sourceLabel: "Source:",
  favEmpty1: "No favorites yet.",
  favEmpty2: "Open a page and click ☆ Favorite.",
  addressLabel: "Address:",
  favorite: "Favorite",
  newTab: "Open current page in a new tab",
  showHidePanel: "Show/hide panel",
  ready: "Ready",
  keywordsLabel: "Keywords:",
  seeAlso: "See also:",
  notFoundTitle: "Topic not found",
  notFoundBody: (id) => `No page with address <code>${id}</code>.`,
  aboutTagline:
    "A documentation reader in the spirit of Microsoft Document Explorer.",
  aboutLanguage: "Language:",
  languageLabel: "Language",
  manageDocsets: "Manage docsets…",
  importManifest: "Import manifest…",
  importManifestTitle: "Import a .khbm manifest",
  importManifestHint:
    "Adds every docset named in a .khbm manifest, fetched from this URL.",
  uploadedBadge: "uploaded",
  remoteBadge: "remote",
  packsLabel: "Packs:",
  chooseEdition: "Click an edition to show it",
  noDocsets: "No docsets loaded.",
  uploadedTitle: "Uploaded docsets",
  noUploaded: "No uploaded docsets yet. Use File → Open docset… to add a .khb.",
  remove: "Remove",
  uploadError: "Could not read that file as a docset.",
  bundledBadge: "bundled",
  openUrl: "Open from URL…",
  openUrlTitle: "Open docset from URL",
  openUrlHint:
    "The docset is fetched from this URL each session (the host must allow CORS).",
  openUrlChecking: "Fetching…",
  openUrlError: "Could not load a docset from that URL.",
  add: "Add",
  cancel: "Cancel",
  remotesTitle: "Remote docsets",
  docsetLanguage: "Display language",
  versionLabel: "Version",
  changeVersionLang: "Change version / language",
  streamOption: "Stream when the host supports it",
  streamHint:
    "Reads pages on demand over HTTP Range (real full-text search), and falls back to a full download if the host has no Range support.",
  streamSidecars: "Attachment packs (.khba URLs, one per line — optional):",
  streamingBadge: "· streaming",
};

const pl: Strings = {
  menuFile: "Plik",
  menuEdit: "Edycja",
  menuView: "Widok",
  menuHelp: "Pomoc",
  openDocset: "Otwórz docset…",
  print: "Drukuj…",
  find: "Znajdź na stronie…",
  sync: "Zsynchronizuj ze spisem treści",
  clearHighlight: "Wyczyść podświetlenie wyszukiwania",
  largerText: "Większy tekst",
  smallerText: "Mniejszy tekst",
  back: "Wstecz",
  forward: "Dalej",
  about: "O programie kdhelp",
  share: "Udostępnij…",
  linkCopied: "Skopiowano link",
  refreshing: "Odświeżanie…",
  textSize: "Rozmiar tekstu",
  close: "Zamknij",
  updateReady: "Dostępna jest nowa wersja.",
  updateReload: "Odśwież",
  docsetUpdated: (title, from, to) =>
    `${title} zaktualizowano: ${from} → ${to}`,
  contents: "Spis treści",
  index: "Indeks",
  search: "Szukaj",
  advancedSearch: "Wyszukiwanie zaawansowane…",
  favorites: "Ulubione",
  filterLabel: "Filtruj wg kategorii:",
  filterAll: "(wszystkie)",
  filterProduct: "Filtruj wg produktu:",
  filterAllProducts: "(wszystkie produkty)",
  searchPlaceholder: "Wpisz szukane słowa…",
  searchPrompt: "Wpisz słowa, aby przeszukać dokumentację.",
  noResults: "Brak wyników dla:",
  searchResults: (n) => `${n} ${n === 1 ? "wynik" : "wyników"}`,
  indexKeywords: (n) => `${n} ${n === 1 ? "hasło" : "haseł"}`,
  sortBy: "Sortuj wg:",
  sortRank: "Trafność",
  sortTitle: "Tytuł",
  sortSource: "Źródło",
  scopeProduct: "Produkt:",
  allProducts: "(wszystkie produkty)",
  sourceLabel: "Źródło:",
  favEmpty1: "Brak ulubionych.",
  favEmpty2: "Otwórz stronę i kliknij ☆ Ulubione.",
  addressLabel: "Adres:",
  favorite: "Ulubione",
  newTab: "Otwórz bieżącą stronę w nowej karcie",
  showHidePanel: "Pokaż/ukryj panel",
  ready: "Gotowe",
  keywordsLabel: "Słowa kluczowe:",
  seeAlso: "Zobacz też:",
  notFoundTitle: "Nie znaleziono tematu",
  notFoundBody: (id) => `Brak strony o adresie <code>${id}</code>.`,
  aboutTagline:
    "Przeglądarka dokumentacji w duchu Microsoft Document Explorer.",
  aboutLanguage: "Język:",
  languageLabel: "Język",
  manageDocsets: "Zarządzaj docsetami…",
  importManifest: "Importuj manifest…",
  importManifestTitle: "Importuj manifest .khbm",
  importManifestHint:
    "Dodaje wszystkie docsety wymienione w manifeście .khbm, pobieranym z tego URL.",
  uploadedBadge: "wgrany",
  remoteBadge: "zdalny",
  packsLabel: "Pakiety:",
  chooseEdition: "Kliknij edycję, aby ją wyświetlić",
  noDocsets: "Brak wczytanych docsetów.",
  uploadedTitle: "Wgrane docsety",
  noUploaded:
    "Brak wgranych docsetów. Użyj Plik → Otwórz docset…, aby dodać plik .khb.",
  remove: "Usuń",
  uploadError: "Nie udało się odczytać tego pliku jako docsetu.",
  bundledBadge: "wbudowany",
  openUrl: "Otwórz z URL…",
  openUrlTitle: "Otwórz docset z URL",
  openUrlHint:
    "Docset jest pobierany z tego URL przy każdym uruchomieniu (host musi zezwalać na CORS).",
  openUrlChecking: "Pobieranie…",
  openUrlError: "Nie udało się wczytać docsetu z tego URL.",
  add: "Dodaj",
  cancel: "Anuluj",
  remotesTitle: "Zdalne docsety",
  docsetLanguage: "Język wyświetlania",
  versionLabel: "Wersja",
  changeVersionLang: "Zmień wersję / język",
  streamOption: "Strumieniuj, gdy host to wspiera",
  streamHint:
    "Czyta strony na żądanie po HTTP Range (prawdziwe wyszukiwanie pełnotekstowe); gdy host nie wspiera Range, pobiera plik w całości.",
  streamSidecars:
    "Paczki załączników (adresy .khba, po jednym w wierszu — opcjonalne):",
  streamingBadge: "· strumieniowanie",
};

const TABLES: Record<Lang, Strings> = { en, pl };

export function strings(lang: string): Strings {
  return TABLES[lang as Lang] ?? en;
}

/**
 * Fill static labels from the string table. Elements opt in via:
 * `data-i18n` (textContent), `data-i18n-title` (title), `data-i18n-ph` (placeholder).
 */
export function applyStatic(lang: string, root: ParentNode = document): void {
  const s = strings(lang) as unknown as Record<string, unknown>;
  const value = (key: string | undefined): string | undefined => {
    const v = key ? s[key] : undefined;
    return typeof v === "string" ? v : undefined;
  };
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const v = value(el.dataset.i18n);
    if (v !== undefined) el.textContent = v;
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    const v = value(el.dataset.i18nTitle);
    if (v !== undefined) el.title = v;
  });
  root.querySelectorAll<HTMLInputElement>("[data-i18n-ph]").forEach((el) => {
    const v = value(el.dataset.i18nPh);
    if (v !== undefined) el.placeholder = v;
  });
}
