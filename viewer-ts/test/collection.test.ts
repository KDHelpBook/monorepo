import { describe, expect, it } from "vitest";
import { Collection } from "../src/data/collection";
import type {
  Category,
  IDocset,
  KeywordEntry,
  SearchHit,
  TocNode,
} from "../src/data/docset";

// A minimal in-memory IDocset so we can test Collection's merge/namespace/rank
// logic without sql.js or a real .khb — Collection only ever calls this interface.
function stub(cfg: {
  id: string;
  collection?: string;
  collectionTitle?: string;
  version?: string;
  products?: { id: string; title: string }[];
  title?: string;
  toc?: TocNode[];
  categories?: Category[];
  keywords?: KeywordEntry[];
  related?: Record<string, string[]>;
  pagesByCategory?: Record<string, string[]>;
  pages?: Record<string, string>;
  hits?: SearchHit[];
}): IDocset {
  return {
    id: cfg.id,
    language: "en",
    title: cfg.title ?? cfg.id,
    collection: cfg.collection ?? cfg.id,
    collectionTitle: cfg.collectionTitle ?? cfg.title ?? cfg.id,
    version: cfg.version ?? "",
    products: cfg.products ?? [
      { id: cfg.collection ?? cfg.id, title: cfg.collectionTitle ?? cfg.id },
    ],
    tocTree: () => cfg.toc ?? [],
    categories: () => cfg.categories ?? [],
    keywords: () => cfg.keywords ?? [],
    pagesByCategory: (c) => cfg.pagesByCategory?.[c] ?? [],
    related: (id) => cfg.related?.[id] ?? [],
    page: async (id) =>
      cfg.pages?.[id] != null
        ? { id, title: id, bodyHtml: cfg.pages[id]! }
        : null,
    asset: async () => null,
    search: async () => cfg.hits ?? [],
    close: () => {},
  };
}

const leaf = (pageId: string, title = pageId): TocNode => ({
  pageId,
  title,
  children: [],
});

describe("Collection namespacing", () => {
  const c = Collection.of([stub({ id: "book" })], "en");
  it("splits a namespaced id", () => {
    expect(c.split("book:intro")).toEqual({
      docsetId: "book",
      localId: "intro",
    });
  });
  it("resolves an in-book link relative to the source page's book", () => {
    expect(c.resolveLink("book:intro", "next")).toBe("book:next");
  });
});

describe("Collection families", () => {
  it("groups docsets sharing a collection into one family", () => {
    const c = Collection.of(
      [
        stub({ id: "guide", collection: "prod", collectionTitle: "Product" }),
        stub({ id: "api", collection: "prod", collectionTitle: "Product" }),
      ],
      "en",
    );
    const fams = c.families();
    expect(fams).toHaveLength(1);
    expect(fams[0]!.docsetIds).toEqual(["guide", "api"]);
  });

  it("keeps different collections as separate families", () => {
    const c = Collection.of(
      [stub({ id: "a", collection: "x" }), stub({ id: "b", collection: "y" })],
      "en",
    );
    expect(c.families().map((f) => f.id)).toEqual(["x", "y"]);
  });
});

describe("Collection tocTree", () => {
  it("merges one family flat, with no wrapper folder", () => {
    const c = Collection.of(
      [
        stub({ id: "a", collection: "p", toc: [leaf("intro")] }),
        stub({ id: "b", collection: "p", toc: [leaf("more")] }),
      ],
      "en",
    );
    const tree = c.tocTree();
    expect(tree.map((n) => n.pageId)).toEqual(["a:intro", "b:more"]);
    expect(tree.some((n) => n.group)).toBe(false);
  });

  it("wraps several families in collapsible group folders", () => {
    const c = Collection.of(
      [
        stub({
          id: "a",
          collection: "x",
          collectionTitle: "X",
          toc: [leaf("i")],
        }),
        stub({
          id: "b",
          collection: "y",
          collectionTitle: "Y",
          toc: [leaf("j")],
        }),
      ],
      "en",
    );
    const tree = c.tocTree();
    expect(tree).toHaveLength(2);
    expect(tree[0]).toMatchObject({ pageId: "@collection:x", group: true });
    expect(tree[0]!.children.map((n) => n.pageId)).toEqual(["a:i"]);
  });
});

describe("Collection index & categories", () => {
  it("unions keywords across books with namespaced page ids", () => {
    const c = Collection.of(
      [
        stub({ id: "a", keywords: [{ term: "async", pageIds: ["p1"] }] }),
        stub({ id: "b", keywords: [{ term: "async", pageIds: ["q1"] }] }),
      ],
      "en",
    );
    const kw = c.keywords().find((k) => k.term === "async");
    expect(kw?.pageIds).toEqual(["a:p1", "b:q1"]);
  });

  it("dedupes categories by id", () => {
    const c = Collection.of(
      [
        stub({ id: "a", categories: [{ id: "basics", title: "Basics" }] }),
        stub({ id: "b", categories: [{ id: "basics", title: "Basics" }] }),
      ],
      "en",
    );
    expect(c.categories()).toHaveLength(1);
  });

  it("unions pagesByCategory with namespaced ids", () => {
    const c = Collection.of(
      [
        stub({ id: "a", pagesByCategory: { basics: ["p1"] } }),
        stub({ id: "b", pagesByCategory: { basics: ["q1"] } }),
      ],
      "en",
    );
    expect(c.pagesByCategory("basics")).toEqual(["a:p1", "b:q1"]);
  });
});

describe("Collection page & related", () => {
  it("namespaces a returned page id", async () => {
    const c = Collection.of(
      [stub({ id: "a", pages: { intro: "<h1>x</h1>" } })],
      "en",
    );
    const p = await c.page("a:intro");
    expect(p).toMatchObject({ id: "a:intro", bodyHtml: "<h1>x</h1>" });
  });

  it("namespaces local related ids but keeps cross-book ones", () => {
    const c = Collection.of(
      [stub({ id: "a", related: { intro: ["next", "b:faq"] } })],
      "en",
    );
    expect(c.related("a:intro")).toEqual(["a:next", "b:faq"]);
  });
});

describe("Collection.search score normalization", () => {
  it("interleaves books fairly despite different raw score scales", async () => {
    // Book A scores in the hundreds (sql.js heuristic); book B in single digits
    // (FTS5 -bm25). Without normalization B's hits would be crowded out.
    const a = stub({
      id: "a",
      hits: [
        { pageId: "p1", title: "A-top", snippet: "", score: 100 },
        { pageId: "p2", title: "A-low", snippet: "", score: 40 },
      ],
    });
    const b = stub({
      id: "b",
      hits: [{ pageId: "q1", title: "B-top", snippet: "", score: 2 }],
    });
    const hits = await Collection.of([a, b], "en").search("x", 40);
    expect(hits.map((h) => h.pageId)).toContain("b:q1");
    // Each book's top hit normalizes to 1, so A-top and B-top tie at the front.
    const top = hits.filter((h) => h.score === 1).map((h) => h.pageId);
    expect(top).toEqual(expect.arrayContaining(["a:p1", "b:q1"]));
    // A's weaker hit ranks below the two leaders.
    const low = hits.find((h) => h.pageId === "a:p2");
    expect(low!.score).toBeLessThan(1);
  });

  it("honours the limit after merging", async () => {
    const many = (id: string): IDocset =>
      stub({
        id,
        hits: Array.from({ length: 30 }, (_, i) => ({
          pageId: `p${i}`,
          title: `${id}${i}`,
          snippet: "",
          score: 30 - i,
        })),
      });
    const hits = await Collection.of([many("a"), many("b")], "en").search(
      "x",
      10,
    );
    expect(hits).toHaveLength(10);
  });
});
