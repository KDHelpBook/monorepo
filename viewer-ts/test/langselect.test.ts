import { describe, expect, it } from "vitest";
import {
  chooseCollectionLang,
  languagesByCollection,
  pickLanguages,
} from "../src/data/langselect";

// The example line-up: two products in en+pl, one (lorem) en-only.
const variants = [
  { collection: "kdhelp-docs", language: "en", id: "docs-en" },
  { collection: "kdhelp-docs", language: "pl", id: "docs-pl" },
  { collection: "kdhelp-tips", language: "en", id: "tips-en" },
  { collection: "kdhelp-tips", language: "pl", id: "tips-pl" },
  { collection: "lorem", language: "en", id: "lorem-en" },
];

const ids = (vs: { id: string }[]): string[] => vs.map((v) => v.id).sort();

describe("languagesByCollection", () => {
  it("lists available languages per collection in first-seen order", () => {
    const m = languagesByCollection(variants);
    expect(m.get("kdhelp-docs")).toEqual(["en", "pl"]);
    expect(m.get("lorem")).toEqual(["en"]);
  });
});

describe("chooseCollectionLang", () => {
  const fb = ["en"];
  it("prefers a valid override, then the UI language", () => {
    expect(chooseCollectionLang(["en", "pl"], "pl", "en", fb)).toBe("en");
    expect(chooseCollectionLang(["en", "pl"], "pl", undefined, fb)).toBe("pl");
  });
  it("ignores an override the collection doesn't offer", () => {
    expect(chooseCollectionLang(["en"], "pl", "de", fb)).toBe("en");
  });
  it("falls back in order, then to the first language", () => {
    expect(
      chooseCollectionLang(["de", "fr"], "pl", undefined, ["en", "fr"]),
    ).toBe("fr");
    expect(chooseCollectionLang(["de", "cz"], "pl", undefined, ["en"])).toBe(
      "de",
    );
  });
});

describe("pickLanguages", () => {
  it("shows the UI language where available, falling back otherwise", () => {
    // UI = pl: docs+tips show pl; lorem (en-only) still shows in en.
    const shown = pickLanguages(variants, "pl", {}, ["en"]);
    expect(ids(shown)).toEqual(["docs-pl", "lorem-en", "tips-pl"]);
  });

  it("hides other-language variants when the UI language exists", () => {
    const shown = pickLanguages(variants, "en", {}, ["en"]);
    expect(ids(shown)).toEqual(["docs-en", "lorem-en", "tips-en"]);
  });

  it("honours a per-collection override even against the UI language", () => {
    // UI = pl, but pin kdhelp-docs to en.
    const shown = pickLanguages(variants, "pl", { "kdhelp-docs": "en" }, [
      "en",
    ]);
    expect(ids(shown)).toEqual(["docs-en", "lorem-en", "tips-pl"]);
  });

  it("keeps exactly one variant per collection", () => {
    const shown = pickLanguages(variants, "en", {}, ["en"]);
    const cols = shown.map((v) => v.collection);
    expect(new Set(cols).size).toBe(cols.length);
  });
});
