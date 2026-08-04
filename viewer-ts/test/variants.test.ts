import { describe, expect, it, vi } from "vitest";
import { pickVersions } from "../src/data/versions";
import type { ManifestEntry } from "../src/data/manifest";
import {
  bundledVariants,
  openSources,
  variantKey,
  type EditionEffects,
} from "../src/data/variants";

/** Effects that record every call, so a test can assert what the boot path *didn't*
 *  do. `rangeSupported` answers yes by default (the streaming happy path). */
function fakeEffects(over: Partial<EditionEffects> = {}): {
  effects: EditionEffects;
  probed: string[];
  peeked: string[];
  prefetched: Map<string, { url: string; hash: string; packUrls: string[] }>;
} {
  const probed: string[] = [];
  const peeked: string[] = [];
  const prefetched = new Map<
    string,
    { url: string; hash: string; packUrls: string[] }
  >();
  const effects: EditionEffects = {
    docsetUrl: (file, hash) => `https://site/${file}${hash ? `?v=${hash}` : ""}`,
    packUrl: (file) => `https://site/${file}?v=build`,
    filePath: (file, hash) => `${file}${hash ? `?v=${hash}` : ""}`,
    blobKey: (url, hash) => `${url}@${hash}`,
    extraPacks: () => [],
    prefetchOn: false,
    getBlob: () => Promise.resolve(null),
    rangeSupported: (url) => {
      probed.push(url);
      return Promise.resolve(true);
    },
    peek: (url) => {
      peeked.push(url);
      return Promise.resolve();
    },
    prefetchable: (id, item) => prefetched.set(id, item),
    ...over,
  };
  return { effects, probed, peeked, prefetched };
}

const book = (over: Partial<ManifestEntry> = {}): ManifestEntry => ({
  file: "docsets/docs.khb",
  id: "docs",
  title: "Docs",
  language: "en",
  collection: "product",
  version: "2.0.0",
  hash: "h2",
  streaming: true,
  versions: [
    {
      version: "1.2.0",
      file: "docsets/docs-1.2.0.khb",
      title: "Docs",
      language: "en",
      collection: "product",
      hash: "h1",
    },
  ],
  ...over,
});

describe("bundledVariants", () => {
  it("describes every edition without touching the network", () => {
    const { effects, probed, peeked } = fakeEffects();
    const { variants } = bundledVariants([book()], effects);
    expect(variants.map((v) => v.version)).toEqual(["2.0.0", "1.2.0"]);
    expect(probed).toEqual([]);
    expect(peeked).toEqual([]);
  });

  it("keys editions of one book distinctly", () => {
    const { effects } = fakeEffects();
    const { variants } = bundledVariants([book()], effects);
    expect(variants.map((v) => v.key)).toEqual([
      variantKey("docs", "2.0.0"),
      variantKey("docs", "1.2.0"),
    ]);
    expect(new Set(variants.map((v) => v.id)).size).toBe(1);
  });

  it("claims a prefetch-cache key per edition, so a pinned archive isn't pruned", () => {
    const { effects } = fakeEffects();
    const { blobKeys } = bundledVariants([book()], effects);
    expect([...blobKeys]).toEqual([
      "https://site/docsets/docs.khb?v=h2@h2",
      "https://site/docsets/docs-1.2.0.khb?v=h1@h1",
    ]);
  });

  it("claims no cache key for an edition that can't stream", () => {
    const { effects } = fakeEffects();
    const { blobKeys } = bundledVariants(
      [book({ streaming: false })],
      effects,
    );
    expect([...blobKeys]).toEqual([]);
  });
});

describe("resolve", () => {
  it("negotiates only the chosen edition", async () => {
    const { effects, probed, peeked } = fakeEffects();
    const { variants } = bundledVariants([book()], effects);
    const chosen = pickVersions(variants, {});
    expect(chosen.map((v) => v.version)).toEqual(["2.0.0"]);

    const sources = await openSources(chosen);
    expect(sources).toEqual([
      {
        url: "https://site/docsets/docs.khb?v=h2",
        mode: "streaming",
        attachments: [],
      },
    ]);
    // The 1.2.0 edition was described, never opened.
    expect(probed).toEqual(["https://site/docsets/docs.khb?v=h2"]);
    expect(peeked).toEqual(["https://site/docsets/docs.khb?v=h2"]);
  });

  it("negotiates a pinned older edition instead, and only that one", async () => {
    const { effects, probed } = fakeEffects();
    const { variants } = bundledVariants([book()], effects);
    const chosen = pickVersions(variants, { product: "1.2.0" });
    await openSources(chosen);
    expect(probed).toEqual(["https://site/docsets/docs-1.2.0.khb?v=h1"]);
  });

  it("memoizes: re-picking the same edition never re-probes", async () => {
    const { effects, probed } = fakeEffects();
    const { variants } = bundledVariants([book()], effects);
    const chosen = pickVersions(variants, {});
    await openSources(chosen);
    await openSources(chosen);
    expect(probed).toHaveLength(1);
  });

  it("registers a streamed edition for background prefetching", async () => {
    const { effects, prefetched } = fakeEffects();
    const { variants } = bundledVariants([book()], effects);
    await openSources(pickVersions(variants, {}));
    expect(prefetched.get("docs")).toEqual({
      url: "https://site/docsets/docs.khb?v=h2",
      hash: "h2",
      packUrls: [],
    });
    expect(variants[0]!.origin.streaming).toBe(true);
  });

  it("falls back to a whole fetch when the host ignores Range", async () => {
    const { effects, peeked } = fakeEffects({
      rangeSupported: () => Promise.resolve(false),
    });
    const { variants } = bundledVariants([book()], effects);
    const [source] = await openSources(pickVersions(variants, {}));
    expect(source).toEqual({
      file: "docsets/docs.khb?v=h2",
      attachments: [],
    });
    expect(peeked).toEqual([]);
    expect(variants[0]!.origin.streaming).toBe(false);
  });

  it("falls back to a whole fetch when the streamed open fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { effects } = fakeEffects({
      peek: () => Promise.reject(new Error("bad engine")),
    });
    const { variants } = bundledVariants([book()], effects);
    const [source] = await openSources(pickVersions(variants, {}));
    expect(source).toMatchObject({ file: "docsets/docs.khb?v=h2" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("opens a prefetched edition from cache, marking it offline", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const { effects, probed } = fakeEffects({
      prefetchOn: true,
      getBlob: (key) =>
        Promise.resolve(
          key === "https://site/docsets/docs.khb?v=h2@h2"
            ? { bytes, packs: [] }
            : null,
        ),
    });
    const { variants } = bundledVariants([book()], effects);
    const [source] = await openSources(pickVersions(variants, {}));
    expect(source).toEqual({ bytes, attachments: [] });
    expect(probed).toEqual([]); // cache hit: no probe at all
    expect(variants[0]!.origin).toMatchObject({
      offline: true,
      streaming: false,
    });
  });

  it("passes the docset's own packs and the reader's extra packs to the source", async () => {
    const { effects } = fakeEffects({ extraPacks: () => ["extra.khba"] });
    const { variants } = bundledVariants(
      [book({ attachments: ["docsets/docs.khba"], versions: [] })],
      effects,
    );
    const [source] = await openSources(pickVersions(variants, {}));
    expect(source).toMatchObject({
      attachments: [
        "https://site/docsets/docs.khba?v=build",
        "https://site/extra.khba?v=build",
      ],
    });
    expect(variants[0]!.origin.packs).toEqual([
      "docsets/docs.khba",
      "extra.khba",
    ]);
  });
});
