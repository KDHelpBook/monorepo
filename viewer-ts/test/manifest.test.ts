import { describe, expect, it, vi } from "vitest";
import {
  expandEditions,
  resolveManifestUrl,
  streamEligible,
  type ManifestEntry,
} from "../src/data/manifest";

const entry = (over: Partial<ManifestEntry> = {}): ManifestEntry => ({
  file: "docsets/docs.khb",
  id: "docs",
  title: "Docs",
  language: "en",
  ...over,
});

describe("streamEligible", () => {
  it("requires the explicit opt-in", () => {
    expect(streamEligible(entry())).toBe(false);
    expect(streamEligible(entry({ streaming: false }))).toBe(false);
    expect(streamEligible(entry({ streaming: true }))).toBe(true);
  });

  it("rejects a gzip-compressed docset (Range needs raw SQLite pages)", () => {
    expect(
      streamEligible(entry({ file: "docsets/docs.khb.gz", streaming: true })),
    ).toBe(false);
  });

  it("rejects gzip-compressed packs (they would be streamed too)", () => {
    expect(
      streamEligible(
        entry({ streaming: true, attachments: ["docsets/docs.khba"] }),
      ),
    ).toBe(true);
    expect(
      streamEligible(
        entry({ streaming: true, attachments: ["docsets/docs.khba.gz"] }),
      ),
    ).toBe(false);
    // Reader-attached extra packs count as well.
    expect(streamEligible(entry({ streaming: true }), ["extra.khba.gz"])).toBe(
      false,
    );
    expect(streamEligible(entry({ streaming: true }), ["extra.khba"])).toBe(
      true,
    );
  });
});

describe("expandEditions", () => {
  const older = {
    version: "1.0.0",
    file: "docsets/docs-1.0.0.khb",
    title: "Docs (1.0)",
    language: "en",
    collection: "product",
  };

  it("yields just the entry when it lists no older editions", () => {
    expect(expandEditions(entry({ version: "2.0.0" }))).toEqual([
      {
        id: "docs",
        collection: "docs", // no `collection` in the manifest → falls back to the id
        language: "en",
        version: "2.0.0",
        title: "Docs",
        file: "docsets/docs.khb",
        attachments: [],
        streaming: false,
      },
    ]);
  });

  it("puts the current edition first, then each older one", () => {
    const editions = expandEditions(
      entry({ version: "2.0.0", collection: "product", versions: [older] }),
    );
    expect(editions.map((e) => e.version)).toEqual(["2.0.0", "1.0.0"]);
    expect(editions[1]).toMatchObject({
      id: "docs", // editions of one book share its docset id
      title: "Docs (1.0)",
      file: "docsets/docs-1.0.0.khb",
      collection: "product",
    });
  });

  it("carries an edition's own metadata (a book may have been retitled)", () => {
    const [, archived] = expandEditions(
      entry({
        version: "2.0.0",
        collection: "product",
        versions: [{ ...older, collection: "old-product" }],
      }),
    );
    expect(archived?.collection).toBe("old-product");
  });

  it("evaluates streaming eligibility per edition", () => {
    const editions = expandEditions(
      entry({
        version: "2.0.0",
        streaming: true,
        versions: [{ ...older, file: "docsets/docs-1.0.0.khb.gz" }],
      }),
    );
    expect(streamEligible(editions[0]!)).toBe(true);
    // A gzip'd archive can't answer Range reads — it stays a whole fetch.
    expect(streamEligible(editions[1]!)).toBe(false);
  });

  it("ignores a malformed edition instead of failing the boot", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const editions = expandEditions(
      entry({
        version: "2.0.0",
        versions: [
          { ...older, title: undefined } as unknown as typeof older,
          older,
        ],
      }),
    );
    expect(editions.map((e) => e.version)).toEqual(["2.0.0", "1.0.0"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("never offers the same version twice", () => {
    const editions = expandEditions(
      entry({ version: "1.0.0", versions: [older] }),
    );
    expect(editions).toHaveLength(1);
  });
});

describe("resolveManifestUrl", () => {
  it("resolves a dist-relative path against the site base", () => {
    expect(
      resolveManifestUrl(
        "docsets/docs.khb",
        "https://example.com/help/index.html",
      ),
    ).toBe("https://example.com/help/docsets/docs.khb");
  });

  it("leaves an absolute URL alone", () => {
    expect(
      resolveManifestUrl(
        "https://cdn.example.com/docs.khb",
        "https://example.com/help/",
      ),
    ).toBe("https://cdn.example.com/docs.khb");
  });
});
