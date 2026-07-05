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
  // modes / tabs
  contents: string;
  index: string;
  search: string;
  favorites: string;
  // left panel
  filterLabel: string;
  filterAll: string;
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
  scopeBook: string;
  allBooks: string;
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
  notFoundTitle: string;
  notFoundBody: (id: string) => string;
  // about
  aboutTagline: string;
  aboutLanguage: string;
  languageLabel: string;
  // library
  manageDocsets: string;
  uploadedTitle: string;
  noUploaded: string;
  remove: string;
  uploadError: string;
  bundledBadge: string;
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
  contents: "Contents",
  index: "Index",
  search: "Search",
  favorites: "Favorites",
  filterLabel: "Filter by category:",
  filterAll: "(all)",
  searchPlaceholder: "Type words to search…",
  searchPrompt: "Type words to search the documentation.",
  noResults: "No results for:",
  searchResults: (n) => `${n} result${n === 1 ? "" : "s"}`,
  indexKeywords: (n) => `${n} keyword${n === 1 ? "" : "s"}`,
  sortBy: "Sort by:",
  sortRank: "Rank",
  sortTitle: "Title",
  sortSource: "Source",
  scopeBook: "Book:",
  allBooks: "(all books)",
  sourceLabel: "Source:",
  favEmpty1: "No favorites yet.",
  favEmpty2: "Open a page and click ☆ Favorite.",
  addressLabel: "Address:",
  favorite: "Favorite",
  newTab: "Open current page in a new tab",
  showHidePanel: "Show/hide panel",
  ready: "Ready",
  keywordsLabel: "Keywords:",
  notFoundTitle: "Topic not found",
  notFoundBody: (id) => `No page with address <code>${id}</code>.`,
  aboutTagline:
    "A documentation reader in the spirit of Microsoft Document Explorer.",
  aboutLanguage: "Language:",
  languageLabel: "Language",
  manageDocsets: "Manage docsets…",
  uploadedTitle: "Uploaded docsets",
  noUploaded: "No uploaded docsets yet. Use File → Open docset… to add a .khb.",
  remove: "Remove",
  uploadError: "Could not read that file as a docset.",
  bundledBadge: "bundled",
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
  contents: "Spis treści",
  index: "Indeks",
  search: "Szukaj",
  favorites: "Ulubione",
  filterLabel: "Filtruj wg kategorii:",
  filterAll: "(wszystkie)",
  searchPlaceholder: "Wpisz szukane słowa…",
  searchPrompt: "Wpisz słowa, aby przeszukać dokumentację.",
  noResults: "Brak wyników dla:",
  searchResults: (n) => `${n} ${n === 1 ? "wynik" : "wyników"}`,
  indexKeywords: (n) => `${n} ${n === 1 ? "hasło" : "haseł"}`,
  sortBy: "Sortuj wg:",
  sortRank: "Trafność",
  sortTitle: "Tytuł",
  sortSource: "Źródło",
  scopeBook: "Książka:",
  allBooks: "(wszystkie książki)",
  sourceLabel: "Źródło:",
  favEmpty1: "Brak ulubionych.",
  favEmpty2: "Otwórz stronę i kliknij ☆ Ulubione.",
  addressLabel: "Adres:",
  favorite: "Ulubione",
  newTab: "Otwórz bieżącą stronę w nowej karcie",
  showHidePanel: "Pokaż/ukryj panel",
  ready: "Gotowe",
  keywordsLabel: "Słowa kluczowe:",
  notFoundTitle: "Nie znaleziono tematu",
  notFoundBody: (id) => `Brak strony o adresie <code>${id}</code>.`,
  aboutTagline:
    "Przeglądarka dokumentacji w duchu Microsoft Document Explorer.",
  aboutLanguage: "Język:",
  languageLabel: "Język",
  manageDocsets: "Zarządzaj docsetami…",
  uploadedTitle: "Wgrane docsety",
  noUploaded:
    "Brak wgranych docsetów. Użyj Plik → Otwórz docset…, aby dodać plik .khb.",
  remove: "Usuń",
  uploadError: "Nie udało się odczytać tego pliku jako docsetu.",
  bundledBadge: "wbudowany",
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
