import { describe, expect, it, vi } from "vitest";
import type { TocNode } from "../src/data/docset";
import {
  applyFolders,
  folderCollections,
  folderTitle,
  sanitizeFolders,
} from "../src/data/folders";
import type { FolderNode } from "../src/data/manifest";

const FOLDERS: FolderNode[] = [
  {
    id: "tools",
    title: "Developer Tools",
    titles: { pl: "Narzędzia" },
    children: [
      { collection: "khb" },
      { id: "legacy", title: "Legacy", children: [{ collection: "oldapp" }] },
    ],
  },
];

const famRoot = (col: string): TocNode => ({
  pageId: `@collection:${col}`,
  title: col.toUpperCase(),
  group: true,
  children: [{ pageId: `${col}:index`, title: "Index", children: [] }],
});

describe("sanitizeFolders", () => {
  it("passes a valid tree through and treats absence as empty", () => {
    expect(sanitizeFolders(FOLDERS)).toEqual(FOLDERS);
    expect(sanitizeFolders(undefined)).toEqual([]);
  });

  it("drops the field (with a warning) on structural violations", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = [
      "junk", // not an object
      [{ id: "a" }], // missing title
      [{ collection: "x" }], // a bare ref at the top level
      [
        // the same collection placed twice
        { id: "a", title: "A", children: [{ collection: "x" }] },
        { id: "b", title: "B", children: [{ collection: "x" }] },
      ],
      [
        // duplicate folder id
        { id: "a", title: "A" },
        { id: "b", title: "B", children: [{ id: "a", title: "A2" }] },
      ],
      [{ id: "a", title: "A", titles: { pl: 7 } }], // non-string title
    ];
    for (const value of bad) expect(sanitizeFolders(value)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(bad.length);
    warn.mockRestore();
  });
});

describe("folderCollections / folderTitle", () => {
  it("collects every referenced collection id, at any depth", () => {
    expect([...folderCollections(FOLDERS)].sort()).toEqual(["khb", "oldapp"]);
  });

  it("resolves titles[uiLang], falling back to title", () => {
    expect(folderTitle(FOLDERS[0]!, "pl")).toBe("Narzędzia");
    expect(folderTitle(FOLDERS[0]!, "en")).toBe("Developer Tools");
    expect(folderTitle(FOLDERS[0]!, "de")).toBe("Developer Tools");
  });
});

describe("applyFolders", () => {
  it("re-parents referenced family roots under nested @shelf: nodes", () => {
    const roots = [famRoot("khb"), famRoot("oldapp"), famRoot("other")];
    const tree = applyFolders(roots, FOLDERS, "en");
    expect(tree.map((n) => n.pageId)).toEqual([
      "@shelf:tools",
      "@collection:other", // unmentioned family stays at root, after folders
    ]);
    const tools = tree[0]!;
    expect(tools.group).toBe(true);
    expect(tools.title).toBe("Developer Tools");
    expect(tools.children.map((n) => n.pageId)).toEqual([
      "@collection:khb",
      "@shelf:legacy",
    ]);
    expect(tools.children[1]!.children[0]!.pageId).toBe("@collection:oldapp");
  });

  it("uses the UI-language title", () => {
    const tree = applyFolders([famRoot("khb")], FOLDERS, "pl");
    expect(tree[0]!.title).toBe("Narzędzia");
  });

  it("drops refs to absent collections and folders left empty", () => {
    // Only `other` is loaded: `tools` (khb + legacy/oldapp) resolves to nothing
    // and must disappear entirely rather than render empty shelves.
    const tree = applyFolders([famRoot("other")], FOLDERS, "en");
    expect(tree.map((n) => n.pageId)).toEqual(["@collection:other"]);
  });

  it("is a no-op without folders", () => {
    const roots = [famRoot("khb")];
    expect(applyFolders(roots, [], "en")).toBe(roots);
  });
});
