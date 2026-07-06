import { describe, expect, it } from "vitest";
import {
  chooseCollectionVersion,
  compareVersions,
  detectUpdates,
  latestVersion,
  pickVersions,
  versionsByCollection,
} from "../src/data/versions";

describe("detectUpdates", () => {
  it("records first sightings silently (no update announced)", () => {
    const { updates, nextSeen } = detectUpdates(
      [{ id: "a", title: "A", version: "1.0.0" }],
      {},
    );
    expect(updates).toEqual([]);
    expect(nextSeen).toEqual({ a: "1.0.0" });
  });

  it("announces a version change from a known version", () => {
    const { updates, nextSeen } = detectUpdates(
      [{ id: "a", title: "Docs A", version: "1.1.0" }],
      { a: "1.0.0" },
    );
    expect(updates).toEqual([{ title: "Docs A", from: "1.0.0", to: "1.1.0" }]);
    expect(nextSeen.a).toBe("1.1.0");
  });

  it("stays quiet when the version is unchanged", () => {
    const { updates } = detectUpdates(
      [{ id: "a", title: "A", version: "1.0.0" }],
      { a: "1.0.0" },
    );
    expect(updates).toEqual([]);
  });

  it("ignores docsets without a version, and keeps prior seen entries", () => {
    const { updates, nextSeen } = detectUpdates(
      [{ id: "a", title: "A", version: "" }],
      { b: "2.0.0" },
    );
    expect(updates).toEqual([]);
    expect(nextSeen).toEqual({ b: "2.0.0" });
  });

  it("handles several docsets at once", () => {
    const { updates } = detectUpdates(
      [
        { id: "a", title: "A", version: "2.0.0" }, // changed
        { id: "b", title: "B", version: "1.0.0" }, // unchanged
        { id: "c", title: "C", version: "3.0.0" }, // first sight
      ],
      { a: "1.0.0", b: "1.0.0" },
    );
    expect(updates).toEqual([{ title: "A", from: "1.0.0", to: "2.0.0" }]);
  });
});

describe("compareVersions", () => {
  it("orders numerically, not lexically", () => {
    expect(compareVersions("1.10.0", "1.2.0")).toBe(1);
    expect(compareVersions("1.2.0", "1.10.0")).toBe(-1);
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0);
  });
  it("treats missing trailing segments as zero", () => {
    expect(compareVersions("1.2", "1.2.0")).toBe(0);
    expect(compareVersions("1.2.1", "1.2")).toBe(1);
  });
  it("falls back to string compare for non-numeric segments", () => {
    expect(compareVersions("1.0.0-beta", "1.0.0-alpha")).toBe(1);
  });
});

describe("latestVersion", () => {
  it("picks the highest", () => {
    expect(latestVersion(["1.0.0", "2.1.0", "1.9.0"])).toBe("2.1.0");
    expect(latestVersion([])).toBe("");
  });
});

describe("version selection per collection", () => {
  const variants = [
    { collection: "prod", version: "1.0.0", id: "p1" },
    { collection: "prod", version: "2.0.0", id: "p2" },
    { collection: "prod", version: "1.5.0", id: "p15" },
    { collection: "solo", version: "3.0.0", id: "s3" },
  ];

  it("lists versions latest-first per collection", () => {
    const m = versionsByCollection(variants);
    expect(m.get("prod")).toEqual(["2.0.0", "1.5.0", "1.0.0"]);
    expect(m.get("solo")).toEqual(["3.0.0"]);
  });

  it("chooses the override if valid, else the latest", () => {
    expect(chooseCollectionVersion(["2.0.0", "1.0.0"], "1.0.0")).toBe("1.0.0");
    expect(chooseCollectionVersion(["2.0.0", "1.0.0"], "9.9.9")).toBe("2.0.0");
    expect(chooseCollectionVersion(["2.0.0", "1.0.0"], undefined)).toBe(
      "2.0.0",
    );
  });

  it("keeps only the latest version of each product by default", () => {
    const shown = pickVersions(variants, {})
      .map((v) => v.id)
      .sort();
    expect(shown).toEqual(["p2", "s3"]); // prod→2.0.0, solo→3.0.0
  });

  it("honours a per-collection version override", () => {
    const shown = pickVersions(variants, { prod: "1.0.0" })
      .map((v) => v.id)
      .sort();
    expect(shown).toEqual(["p1", "s3"]);
  });
});
