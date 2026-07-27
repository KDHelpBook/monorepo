import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { parseRange, serveDocset } from "../src/serve";
import { fakeKhb } from "./helpers";

const KEY = "docsets/demo/1.0.0/demo.khb";
const bytes = fakeKhb(2); // 8192 bytes
const url = "https://registry.test/d/demo/1.0.0/demo.khb";

const get = (range?: string): Request =>
  new Request(url, { headers: range ? { Range: range } : {} });

beforeAll(async () => {
  await env.DOCSETS.put(KEY, bytes);
});

describe("parseRange", () => {
  it("parses the three single-range forms", () => {
    expect(parseRange("bytes=0-0", 100)).toEqual({ start: 0, end: 0 });
    expect(parseRange("bytes=10-", 100)).toEqual({ start: 10, end: 99 });
    expect(parseRange("bytes=-5", 100)).toEqual({ start: 95, end: 99 });
    expect(parseRange("bytes=0-999", 100)).toEqual({ start: 0, end: 99 });
  });
  it("flags unsatisfiable ranges and passes junk through as whole-file", () => {
    expect(parseRange("bytes=100-", 100)).toBe("invalid");
    expect(parseRange("bytes=5-2", 100)).toBe("invalid");
    expect(parseRange(null, 100)).toBeNull();
    expect(parseRange("bytes=0-0,10-20", 100)).toBeNull(); // multi-range
  });
});

describe("serveDocset", () => {
  it("answers the viewer's probe: bytes=0-0 → 206 + Content-Range total", async () => {
    const res = await serveDocset(get("bytes=0-0"), env, "demo", "1.0.0", "demo.khb");
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(`bytes 0-0/${bytes.byteLength}`);
    expect(res.headers.get("Content-Length")).toBe("1");
    expect((await res.arrayBuffer()).byteLength).toBe(1);
  });

  it("serves an inner range with the right bytes", async () => {
    const res = await serveDocset(
      get("bytes=4096-4099"),
      env,
      "demo",
      "1.0.0",
      "demo.khb",
    );
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe(
      `bytes 4096-4099/${bytes.byteLength}`,
    );
    expect((await res.arrayBuffer()).byteLength).toBe(4);
  });

  it("serves the whole file raw without a Range header", async () => {
    const res = await serveDocset(get(), env, "demo", "1.0.0", "demo.khb");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Encoding")).toBeNull();
    expect((await res.arrayBuffer()).byteLength).toBe(bytes.byteLength);
  });

  it("416s an unsatisfiable range with the total size", async () => {
    const res = await serveDocset(
      get(`bytes=${bytes.byteLength}-`),
      env,
      "demo",
      "1.0.0",
      "demo.khb",
    );
    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe(`bytes */${bytes.byteLength}`);
  });

  it("sends CORS headers (cross-origin viewers need Content-Range exposed)", async () => {
    const res = await serveDocset(get("bytes=0-0"), env, "demo", "1.0.0", "demo.khb");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Expose-Headers")).toContain(
      "Content-Range",
    );
  });

  it("resolves the `latest` alias through the pointer", async () => {
    await env.DOCSETS.put(
      "docsets/demo/latest.json",
      JSON.stringify({
        id: "demo",
        title: "Demo",
        language: "en",
        collection: "demo",
        version: "1.0.0",
        file: "demo.khb",
        attachments: [],
        publishedAt: "2026-01-01T00:00:00Z",
        repository: "acme/demo",
        versions: [],
      }),
    );
    const res = await serveDocset(
      new Request("https://registry.test/d/demo/latest/demo.khb"),
      env,
      "demo",
      "latest",
      "demo.khb",
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("404s a missing key", async () => {
    const res = await serveDocset(get(), env, "demo", "9.9.9", "demo.khb");
    expect(res.status).toBe(404);
  });
});
