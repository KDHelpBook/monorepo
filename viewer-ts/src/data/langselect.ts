// Which language variant of each docset collection to show.
//
// A `collection` is a product/family shared across languages (e.g. `kdhelp-docs`
// exists in both `en` and `pl`). We show exactly ONE language per collection so
// the same book isn't merged twice into the TOC. The choice, per collection:
//   1. the user's explicit override (Manage docsets), if that language exists;
//   2. else the UI language, if the collection offers it;
//   3. else a fallback: the first of `fallbackOrder` the collection has, else its
//      first-seen language.
// Other-language variants of the same collection are dropped — but a collection
// with no variant in the UI language is NOT hidden: it falls back and stays visible.

export interface LangVariant {
  collection: string;
  language: string;
}

/** Languages available per collection, in first-seen order. */
export function languagesByCollection<T extends LangVariant>(
  variants: T[],
): Map<string, string[]> {
  const byCol = new Map<string, string[]>();
  for (const v of variants) {
    const langs =
      byCol.get(v.collection) ?? byCol.set(v.collection, []).get(v.collection)!;
    if (!langs.includes(v.language)) langs.push(v.language);
  }
  return byCol;
}

/** The language chosen for one collection given its available languages. */
export function chooseCollectionLang(
  langs: string[],
  uiLang: string,
  override: string | undefined,
  fallbackOrder: string[],
): string {
  if (override && langs.includes(override)) return override;
  if (langs.includes(uiLang)) return uiLang;
  return fallbackOrder.find((l) => langs.includes(l)) ?? langs[0]!;
}

/** Keep only the chosen language variant of each collection (see module doc). */
export function pickLanguages<T extends LangVariant>(
  variants: T[],
  uiLang: string,
  overrides: Record<string, string>,
  fallbackOrder: string[] = [],
): T[] {
  const byCol = languagesByCollection(variants);
  const chosen = new Map<string, string>();
  for (const [col, langs] of byCol) {
    chosen.set(
      col,
      chooseCollectionLang(langs, uiLang, overrides[col], fallbackOrder),
    );
  }
  return variants.filter((v) => v.language === chosen.get(v.collection));
}
