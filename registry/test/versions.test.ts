import { describe, expect, it } from "vitest";
import {
  compareVersions,
  minorSeries,
  ruleFor,
  selectEditions,
} from "../src/versions";
import type { LatestPointer, PublishedVersion } from "../src/types";

const edition = (
  version: string,
  over: Partial<PublishedVersion> = {},
): PublishedVersion => ({
  version,
  file: "book.khb",
  title: "Book",
  language: "en",
  collection: "product",
  attachments: [],
  publishedAt: "2026-01-01T00:00:00Z",
  repository: "acme/demo",
  ...over,
});

const pointer = (
  current: string,
  versions: PublishedVersion[],
): LatestPointer => ({
  schema: 2,
  id: "book",
  ...edition(current),
  versions,
});

// The same cases the viewer asserts (viewer-ts/test/versions.test.ts) — the two
// implementations must order identically or the viewer's "latest" disagrees with
// what the registry chose to offer.
describe("compareVersions", () => {
  it("compares dotted versions numerically", () => {
    expect(compareVersions("1.10.0", "1.2.0")).toBe(1);
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1);
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
  });

  it("treats missing trailing segments as zero", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.1", "1.2")).toBe(1);
  });

  it("falls back to string order for non-numeric segments", () => {
    expect(compareVersions("latest", "9.9.9")).toBe(1);
    expect(compareVersions("1.0.0-beta", "1.0.0")).toBe(1);
  });
});

describe("minorSeries", () => {
  it("groups patches of one minor release", () => {
    expect(minorSeries("1.4.2")).toBe("1.4");
    expect(minorSeries("1.4.11")).toBe("1.4");
    expect(minorSeries("1.5.0")).toBe("1.5");
    expect(minorSeries("2")).toBe("2.0");
  });

  it("leaves a non-numeric version in its own series", () => {
    expect(minorSeries("nightly")).toBe("nightly");
    expect(minorSeries("1.0.0-rc1")).toBe("1.0.0-rc1");
  });
});

describe("ruleFor", () => {
  it("defaults to no policy at all", () => {
    expect(ruleFor(undefined, "book")).toEqual({
      mode: undefined,
      keep: undefined,
    });
  });

  it("merges a per-docset override over the site rule", () => {
    const policy = {
      mode: "minor" as const,
      keep: 3,
      docsets: { book: { mode: "all" as const } },
    };
    expect(ruleFor(policy, "book")).toEqual({ mode: "all", keep: 3 });
    expect(ruleFor(policy, "other")).toEqual({ mode: "minor", keep: 3 });
  });
});

describe("selectEditions", () => {
  const history = [
    edition("1.4.1"),
    edition("1.4.0"),
    edition("1.3.2"),
    edition("1.3.0"),
    edition("0.9.0"),
  ];

  it("offers nothing by default — the current edition only", () => {
    expect(selectEditions(pointer("1.5.0", history), {})).toEqual([]);
    expect(selectEditions(pointer("1.5.0", history), { mode: "latest" })).toEqual(
      [],
    );
  });

  it("offers every recorded edition, newest first", () => {
    const picked = selectEditions(pointer("1.5.0", history), { mode: "all" });
    expect(picked.map((v) => v.version)).toEqual([
      "1.4.1",
      "1.4.0",
      "1.3.2",
      "1.3.0",
      "0.9.0",
    ]);
  });

  it("offers the newest patch of each minor series", () => {
    const picked = selectEditions(pointer("1.5.0", history), { mode: "minor" });
    expect(picked.map((v) => v.version)).toEqual(["1.4.1", "1.3.2", "0.9.0"]);
  });

  it("drops the series the current edition already represents", () => {
    const picked = selectEditions(pointer("1.4.2", history), { mode: "minor" });
    expect(picked.map((v) => v.version)).toEqual(["1.3.2", "0.9.0"]);
  });

  it("caps the offer to the newest `keep` editions", () => {
    const picked = selectEditions(pointer("1.5.0", history), {
      mode: "all",
      keep: 2,
    });
    expect(picked.map((v) => v.version)).toEqual(["1.4.1", "1.4.0"]);
  });

  it("omits editions published before per-edition metadata existed", () => {
    const legacy = {
      version: "1.0.0",
      file: "book.khb",
      attachments: [],
      publishedAt: "2025-01-01T00:00:00Z",
      repository: "acme/demo",
    } as unknown as PublishedVersion;
    const picked = selectEditions(pointer("1.5.0", [edition("1.4.1"), legacy]), {
      mode: "all",
    });
    expect(picked.map((v) => v.version)).toEqual(["1.4.1"]);
  });

  it("never repeats the current edition", () => {
    const picked = selectEditions(
      pointer("1.4.1", [edition("1.4.1"), edition("1.3.0")]),
      { mode: "all" },
    );
    expect(picked.map((v) => v.version)).toEqual(["1.3.0"]);
  });
});
