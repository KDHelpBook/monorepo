import { describe, expect, it } from "vitest";
import { buildTocTree } from "../src/data/docset";

// Flat `toc` rows as both engines read them (sql.js + streaming). A NULL page_id
// is a pure folder node (format v6).
const row = (
  id: number,
  page_id: string | null,
  parent_id: number | null,
  position: number,
  title: string,
) => ({ id, page_id, parent_id, position, title });

describe("buildTocTree", () => {
  it("builds nested page nodes ordered by position", () => {
    const tree = buildTocTree([
      row(2, "b", null, 1, "B"),
      row(1, "a", null, 0, "A"),
      row(3, "a1", 1, 0, "A1"),
    ]);
    expect(tree.map((n) => n.pageId)).toEqual(["a", "b"]);
    expect(tree[0]!.children[0]).toMatchObject({ pageId: "a1" });
    expect(tree.some((n) => n.group)).toBe(false);
  });

  it("turns a NULL page_id into a stable @folder key with group: true", () => {
    const tree = buildTocTree([
      row(1, null, null, 0, "Reference"),
      row(2, "api", 1, 0, "API"),
      row(3, null, 1, 1, "Extensions!"),
      row(4, "math", 3, 0, "Math"),
    ]);
    const ref = tree[0]!;
    // The key derives from the slugged title path, not from rowids — so it is
    // stable across recompiles and the persisted expanded-state keeps working.
    expect(ref).toMatchObject({
      pageId: "@folder:/reference",
      title: "Reference",
      group: true,
    });
    expect(ref.children.map((n) => n.pageId)).toEqual([
      "api",
      "@folder:/reference/extensions",
    ]);
    expect(ref.children[1]!.group).toBe(true);
    expect(ref.children[1]!.children[0]).toMatchObject({ pageId: "math" });
  });
});
