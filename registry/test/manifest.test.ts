import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { buildManifest, configResponse } from "../src/manifest";
import type { LatestPointer } from "../src/types";

const pointer = (id: string, over: Partial<LatestPointer> = {}): string =>
  JSON.stringify({
    id,
    title: id.toUpperCase(),
    language: "en",
    collection: id,
    version: "1.0.0",
    file: `${id}.khb`,
    attachments: [],
    publishedAt: "2026-01-01T00:00:00Z",
    repository: "acme/demo",
    versions: [],
    ...over,
  } satisfies LatestPointer);

beforeAll(async () => {
  // site.json orders khb-authoring first; zzz is unlisted and must trail.
  await env.DOCSETS.put("docsets/zzz/latest.json", pointer("zzz"));
  await env.DOCSETS.put(
    "docsets/khb-authoring/latest.json",
    pointer("khb-authoring", {
      collection: "khb",
      attachments: ["khb-authoring.khba"],
    }),
  );
});

describe("buildManifest", () => {
  it("lists pointers as streaming entries with versioned serve paths", async () => {
    const manifest = await buildManifest(env);
    const entry = manifest.docsets.find((d) => d.id === "khb-authoring")!;
    expect(entry).toMatchObject({
      file: "d/khb-authoring/1.0.0/khb-authoring.khb",
      collection: "khb",
      version: "1.0.0",
      streaming: true,
      attachments: ["d/khb-authoring/1.0.0/khb-authoring.khba"],
    });
  });

  it("orders entries per site.json, unlisted last", async () => {
    const ids = (await buildManifest(env)).docsets.map((d) => d.id);
    expect(ids.indexOf("khb-authoring")).toBeLessThan(ids.indexOf("zzz"));
  });

  it("attaches the site.json folders tree verbatim", async () => {
    const manifest = await buildManifest(env);
    expect(manifest.folders).toBeDefined();
    expect((manifest.folders as { id: string }[])[0]!.id).toBe("khb");
  });
});

describe("configResponse", () => {
  it("mirrors the CLI's config.json shape", async () => {
    const res = configResponse();
    expect(res.headers.get("Content-Type")).toBe("application/json");
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.externalSources).toBe("boolean");
    expect(typeof body.pwa).toBe("boolean");
  });
});
