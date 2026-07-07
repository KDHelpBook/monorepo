import { describe, expect, it } from "vitest";
import {
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
