import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  allDocsets,
  deleteDocset,
  docsetKey,
  putDocset,
} from "../src/data/library";

/** Recreate the pre-v3 database: one `docsets` store keyed by bare docset id. */
function seedV2(records: Record<string, unknown>[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("khb", 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      const store = db.createObjectStore("docsets", { keyPath: "id" });
      store.createIndex("language", "language", { unique: false });
      db.createObjectStore("blobs", { keyPath: "key" });
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("docsets", "readwrite");
      for (const r of records) tx.objectStore("docsets").put(r);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

const bytes = (n: number): Uint8Array => new Uint8Array([n]);

beforeEach(async () => {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase("khb");
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

describe("docsetKey", () => {
  it("identifies an edition, not a book", () => {
    expect(docsetKey({ id: "docs", version: "1.0.0" })).toBe("docs@1.0.0");
    expect(docsetKey({ id: "docs" })).toBe("docs@");
    expect(docsetKey({ id: "docs", version: "1.0.0" })).not.toBe(
      docsetKey({ id: "docs", version: "2.0.0" }),
    );
  });
});

describe("uploaded docsets", () => {
  it("keeps two editions of one book side by side", async () => {
    await putDocset({
      id: "docs",
      language: "en",
      title: "Docs",
      version: "1.0.0",
      bytes: bytes(1),
    });
    await putDocset({
      id: "docs",
      language: "en",
      title: "Docs",
      version: "2.0.0",
      bytes: bytes(2),
    });
    const stored = await allDocsets();
    expect(stored.map((d) => d.version).sort()).toEqual(["1.0.0", "2.0.0"]);
  });

  it("removes one edition and leaves the other", async () => {
    await putDocset({
      id: "docs",
      language: "en",
      title: "Docs",
      version: "1.0.0",
      bytes: bytes(1),
    });
    await putDocset({
      id: "docs",
      language: "en",
      title: "Docs",
      version: "2.0.0",
      bytes: bytes(2),
    });
    await deleteDocset(docsetKey({ id: "docs", version: "1.0.0" }));
    const stored = await allDocsets();
    expect(stored.map((d) => d.version)).toEqual(["2.0.0"]);
  });

  it("re-uploading the same edition replaces it", async () => {
    const record = {
      id: "docs",
      language: "en",
      title: "Docs",
      version: "1.0.0",
      bytes: bytes(1),
    };
    await putDocset(record);
    await putDocset({ ...record, bytes: bytes(9) });
    const stored = await allDocsets();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.bytes).toEqual(bytes(9));
  });
});

describe("v2 → v3 upgrade", () => {
  it("re-keys existing records by edition, keeping their bytes", async () => {
    await seedV2([
      {
        id: "docs",
        language: "en",
        title: "Docs",
        version: "1.0.0",
        bytes: bytes(1),
      },
      // A record from before `version` was stored at all.
      { id: "legacy", language: "pl", title: "Stare", bytes: bytes(7) },
    ]);
    const stored = (await allDocsets()).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    expect(stored.map((d) => d.key)).toEqual(["docs@1.0.0", "legacy@"]);
    expect(stored[1]!.bytes).toEqual(bytes(7));
  });

  it("lets an upgraded book gain a second edition", async () => {
    await seedV2([
      {
        id: "docs",
        language: "en",
        title: "Docs",
        version: "1.0.0",
        bytes: bytes(1),
      },
    ]);
    await putDocset({
      id: "docs",
      language: "en",
      title: "Docs",
      version: "2.0.0",
      bytes: bytes(2),
    });
    expect((await allDocsets()).map((d) => d.key).sort()).toEqual([
      "docs@1.0.0",
      "docs@2.0.0",
    ]);
  });
});
