import { beforeEach, describe, expect, it } from "vitest";
import {
  loadExpanded,
  loadFavorites,
  loadFontSize,
  loadTabs,
  parseTabs,
  saveExpanded,
  saveFavorites,
  saveFontSize,
  saveTabs,
} from "../src/data/uistate";

// A tiny in-memory localStorage so the persistence helpers can round-trip in the
// node test environment (which has no DOM storage).
class MemStorage {
  private store = new Map<string, string>();
  getItem(k: string): string | null {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, String(v));
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
  clear(): void {
    this.store.clear();
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: MemStorage }).localStorage =
    new MemStorage();
});

describe("parseTabs", () => {
  it("returns null for absent or malformed input", () => {
    expect(parseTabs(null)).toBeNull();
    expect(parseTabs("not json")).toBeNull();
    expect(parseTabs("42")).toBeNull();
    expect(parseTabs(JSON.stringify({ tabs: "nope" }))).toBeNull();
  });

  it("parses tabs + active and preserves the search query", () => {
    const raw = JSON.stringify({
      tabs: [{ id: "a:intro" }, { id: "@search", query: "async" }],
      active: 1,
    });
    expect(parseTabs(raw)).toEqual({
      tabs: [{ id: "a:intro" }, { id: "@search", query: "async" }],
      active: 1,
    });
  });

  it("drops entries without a string id and defaults active to 0", () => {
    const raw = JSON.stringify({ tabs: [{ id: "ok" }, { nope: true }, 5] });
    expect(parseTabs(raw)).toEqual({ tabs: [{ id: "ok" }], active: 0 });
  });
});

describe("favorites persistence", () => {
  it("round-trips and starts empty", () => {
    expect(loadFavorites()).toEqual([]);
    saveFavorites(new Set(["a:one", "b:two"]));
    expect(loadFavorites()).toEqual(["a:one", "b:two"]);
  });
});

describe("tree expansion persistence", () => {
  it("round-trips a set of expanded node ids", () => {
    expect(loadExpanded()).toEqual([]);
    saveExpanded(new Set(["@collection:x", "a:chapter"]));
    expect(loadExpanded()).toEqual(["@collection:x", "a:chapter"]);
  });
});

describe("font size persistence", () => {
  it("returns the fallback when unset and round-trips within bounds", () => {
    expect(loadFontSize(13)).toBe(13);
    saveFontSize(16);
    expect(loadFontSize(13)).toBe(16);
  });

  it("rejects out-of-range or non-numeric stored values", () => {
    saveFontSize(999);
    expect(loadFontSize(13)).toBe(13);
    localStorage.setItem("kdhelp.fontSize", "huge");
    expect(loadFontSize(12)).toBe(12);
  });
});

describe("tabs persistence", () => {
  it("round-trips tabs + active through storage", () => {
    expect(loadTabs()).toBeNull();
    saveTabs({
      tabs: [{ id: "a:p" }, { id: "@search", query: "x" }],
      active: 1,
    });
    expect(loadTabs()).toEqual({
      tabs: [{ id: "a:p" }, { id: "@search", query: "x" }],
      active: 1,
    });
  });
});
