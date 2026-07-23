// Persisted UI state (localStorage): favorites, tree expansion, and open tabs —
// so the reader comes back the way you left it. All calls are best-effort: if
// storage is unavailable they degrade to no-ops / empty defaults.

const K = {
  favorites: "khb.favorites",
  expanded: "khb.expanded",
  tabs: "khb.tabs",
  fontSize: "khb.fontSize",
  theme: "khb.theme",
  docsetLangs: "khb.docsetLangs",
  docsetVersions: "khb.docsetVersions",
  seenVersions: "khb.seenVersions",
} as const;

/** Read a `{ key: string }` map from storage, dropping non-string values. */
function readStringMap(key: string): Record<string, string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!v || typeof v !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val;
    }
    return out;
  } catch {
    return {};
  }
}

function readStringArray(key: string): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable / quota — state just won't persist */
  }
}

// ---- favorites ----
export function loadFavorites(): string[] {
  return readStringArray(K.favorites);
}
export function saveFavorites(ids: Iterable<string>): void {
  write(K.favorites, [...ids]);
}

// ---- tree expansion (a set of expanded node ids: page ids + `@collection:…`) ----
export function loadExpanded(): string[] {
  return readStringArray(K.expanded);
}
export function saveExpanded(ids: Iterable<string>): void {
  write(K.expanded, [...ids]);
}

// ---- last-seen docset versions ({ docsetId: version }) ----
// Lets the viewer notice when a re-fetched remote (or re-uploaded docset) bumped
// its version between sessions, and announce it once.
export function loadSeenVersions(): Record<string, string> {
  return readStringMap(K.seenVersions);
}
export function saveSeenVersions(map: Record<string, string>): void {
  write(K.seenVersions, map);
}

// ---- per-collection display-language overrides ({ collection: language }) ----
export function loadDocsetLangs(): Record<string, string> {
  return readStringMap(K.docsetLangs);
}
export function saveDocsetLangs(map: Record<string, string>): void {
  write(K.docsetLangs, map);
}

// ---- per-collection version overrides ({ collection: version }) ----
export function loadDocsetVersions(): Record<string, string> {
  return readStringMap(K.docsetVersions);
}
export function saveDocsetVersions(map: Record<string, string>): void {
  write(K.docsetVersions, map);
}

// ---- reader font size (px) ----
export function loadFontSize(fallback: number): number {
  try {
    const v = Number(localStorage.getItem(K.fontSize));
    return Number.isFinite(v) && v >= 11 && v <= 20 ? v : fallback;
  } catch {
    return fallback;
  }
}
export function saveFontSize(px: number): void {
  write(K.fontSize, px);
}

// ---- colour theme ----
// "system" (default) follows the OS `prefers-color-scheme`; "light"/"dark" pin it;
// "dark-shell" darkens the app chrome but keeps the docset reading pane light.
export type ThemeMode = "light" | "dark" | "dark-shell" | "system";
export function loadTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(K.theme);
    return v === "light" || v === "dark" || v === "dark-shell" || v === "system"
      ? v
      : "system";
  } catch {
    return "system";
  }
}
export function saveTheme(mode: ThemeMode): void {
  // Stored raw (not JSON) so loadTheme() and the pre-paint inline script in
  // index.html can read it with a plain string compare — same as `khb.lang`.
  try {
    localStorage.setItem(K.theme, mode);
  } catch {
    /* storage unavailable / quota — the choice just won't persist */
  }
}

// ---- open tabs ----
export interface SavedTab {
  id: string;
  query?: string;
}
export interface SavedTabs {
  tabs: SavedTab[];
  active: number;
}

/** Parse a persisted tabs blob, or null if absent/malformed. Exposed for tests. */
export function parseTabs(raw: string | null): SavedTabs | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return null;
    const obj = v as { tabs?: unknown; active?: unknown };
    if (!Array.isArray(obj.tabs)) return null;
    const tabs: SavedTab[] = [];
    for (const t of obj.tabs) {
      if (t && typeof (t as SavedTab).id === "string") {
        const st = t as SavedTab;
        tabs.push(
          st.query != null
            ? { id: st.id, query: String(st.query) }
            : { id: st.id },
        );
      }
    }
    const active = typeof obj.active === "number" ? obj.active : 0;
    return { tabs, active };
  } catch {
    return null;
  }
}

export function loadTabs(): SavedTabs | null {
  try {
    return parseTabs(localStorage.getItem(K.tabs));
  } catch {
    return null;
  }
}
export function saveTabs(state: SavedTabs): void {
  write(K.tabs, state);
}
