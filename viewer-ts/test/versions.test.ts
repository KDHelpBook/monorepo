import { describe, expect, it } from "vitest";
import { detectUpdates } from "../src/data/versions";

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
