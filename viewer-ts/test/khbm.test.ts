import { describe, expect, it } from "vitest";
import { parseKhbm } from "../src/data/khbm";

const BASE = "https://example.test/docs/books.khbm";

describe("parseKhbm", () => {
  it("resolves relative urls + attachments against the manifest url", () => {
    const m = parseKhbm(
      JSON.stringify({
        khbm: 1,
        title: "Docs",
        docsets: [{ url: "en.khb", attachments: ["packs/en.khba"] }],
      }),
      BASE,
    );
    expect(m.title).toBe("Docs");
    expect(m.docsets).toEqual([
      {
        url: "https://example.test/docs/en.khb",
        attachments: ["https://example.test/docs/packs/en.khba"],
      },
    ]);
  });

  it("passes absolute urls through", () => {
    const m = parseKhbm(
      JSON.stringify({
        khbm: 1,
        docsets: [{ url: "https://cdn.test/big.khb" }],
      }),
      BASE,
    );
    expect(m.docsets[0]).toEqual({
      url: "https://cdn.test/big.khb",
      attachments: [],
    });
  });

  it("rejects a malformed top level", () => {
    expect(() => parseKhbm("nope", BASE)).toThrow();
    expect(() => parseKhbm("{}", BASE)).toThrow(); // no khbm marker
    expect(() => parseKhbm(JSON.stringify({ khbm: 1 }), BASE)).toThrow(); // no docsets
  });

  it("skips entries without a usable url, keeps the rest", () => {
    const m = parseKhbm(
      JSON.stringify({
        khbm: 1,
        docsets: [{ nope: true }, { url: 42 }, { url: "ok.khb" }],
      }),
      BASE,
    );
    expect(m.docsets.map((d) => d.url)).toEqual([
      "https://example.test/docs/ok.khb",
    ]);
  });
});
