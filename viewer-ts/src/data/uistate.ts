// Persisted UI state (localStorage): favorites, tree expansion, and open tabs —
// so the reader comes back the way you left it. All calls are best-effort: if
// storage is unavailable they degrade to no-ops / empty defaults.

const K = {
  favorites: "kdhelp.favorites",
  expanded: "kdhelp.expanded",
  tabs: "kdhelp.tabs",
  fontSize: "kdhelp.fontSize",
} as const;

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
