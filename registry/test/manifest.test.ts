import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { buildManifest, configResponse } from "../src/manifest";
import type {
  LatestPointer,
  PublishedVersion,
  SiteConfig,
} from "../src/types";
import { TEST_CONFIG } from "./fixtures";

const pointer = (id: string, over: Partial<LatestPointer> = {}): string =>
  JSON.stringify({
    schema: 2,
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

/** One archived edition, with the display metadata schema 2 records per edition. */
const archived = (
  id: string,
  version: string,
  over: Partial<PublishedVersion> = {},
): PublishedVersion => ({
  version,
  file: `${id}.khb`,
  title: id.toUpperCase(),
  language: "en",
  collection: id,
  attachments: [],
  publishedAt: "2025-06-01T00:00:00Z",
  repository: "acme/demo",
  ...over,
});

beforeAll(async () => {
  // site.json orders khb-authoring first; zzz is unlisted and must trail.
  await env.DOCSETS.put("docsets/zzz/latest.json", pointer("zzz"));
  await env.DOCSETS.put(
    "docsets/khb-authoring/latest.json",
    pointer("khb-authoring", {
      collection: "khb-docs",
      hash: "etag-khb-authoring",
      attachments: ["khb-authoring.khba"],
      version: "1.4.0",
      versions: [
        archived("khb-authoring", "1.3.2", {
          collection: "khb-docs",
          hash: "etag-1.3.2",
          attachments: ["khb-authoring.khba"],
        }),
        archived("khb-authoring", "1.3.1", { collection: "khb-docs" }),
        archived("khb-authoring", "1.2.0", { collection: "khb-docs" }),
      ],
    }),
  );
});

/** The site config with a version policy applied on top. */
const withVersions = (versions: SiteConfig["versions"]): SiteConfig => ({
  ...TEST_CONFIG.site,
  versions,
});

const authoring = async (
  site: SiteConfig = TEST_CONFIG.site,
): Promise<{ versions?: { version: string; file: string }[] }> =>
  (await buildManifest(env, site)).docsets.find((d) => d.id === "khb-authoring")!;

describe("buildManifest", () => {
  it("lists pointers as streaming entries with versioned serve paths", async () => {
    const manifest = await buildManifest(env, TEST_CONFIG.site);
    const entry = manifest.docsets.find((d) => d.id === "khb-authoring")!;
    expect(entry).toMatchObject({
      file: "d/khb-authoring/1.4.0/khb-authoring.khb",
      collection: "khb-docs",
      version: "1.4.0",
      hash: "etag-khb-authoring",
      streaming: true,
      attachments: ["d/khb-authoring/1.4.0/khb-authoring.khba"],
    });
  });

  it("orders entries per site.json, unlisted last", async () => {
    const ids = (await buildManifest(env, TEST_CONFIG.site)).docsets.map(
      (d) => d.id,
    );
    expect(ids.indexOf("khb-authoring")).toBeLessThan(ids.indexOf("zzz"));
  });

  it("attaches the site.json folders tree verbatim", async () => {
    const manifest = await buildManifest(env, TEST_CONFIG.site);
    expect(manifest.folders).toBeDefined();
    expect((manifest.folders as { id: string }[])[0]!.id).toBe("khb");
  });

  it("keeps legacy pointers without a hash compatible", async () => {
    const entry = (await buildManifest(env, TEST_CONFIG.site)).docsets.find(
      (d) => d.id === "zzz",
    )!;
    expect(entry).not.toHaveProperty("hash");
  });
});

describe("buildManifest version policy", () => {
  it("offers only the current edition by default", async () => {
    expect(await authoring()).not.toHaveProperty("versions");
  });

  it("offers every archived edition under mode: all", async () => {
    const entry = await authoring(withVersions({ mode: "all" }));
    expect(entry.versions?.map((v) => v.version)).toEqual([
      "1.3.2",
      "1.3.1",
      "1.2.0",
    ]);
  });

  it("serves each edition from its own immutable path", async () => {
    const entry = await authoring(withVersions({ mode: "all" }));
    expect(entry.versions?.[0]).toMatchObject({
      file: "d/khb-authoring/1.3.2/khb-authoring.khb",
      attachments: ["d/khb-authoring/1.3.2/khb-authoring.khba"],
      hash: "etag-1.3.2",
      title: "KHB-AUTHORING",
      language: "en",
      collection: "khb-docs",
      publishedAt: "2025-06-01T00:00:00Z",
    });
  });

  it("collapses a patch series under mode: minor", async () => {
    const entry = await authoring(withVersions({ mode: "minor" }));
    expect(entry.versions?.map((v) => v.version)).toEqual(["1.3.2", "1.2.0"]);
  });

  it("caps the offer with keep", async () => {
    const entry = await authoring(withVersions({ mode: "all", keep: 1 }));
    expect(entry.versions?.map((v) => v.version)).toEqual(["1.3.2"]);
  });

  it("lets one docset override the site policy", async () => {
    const site = withVersions({
      mode: "latest",
      docsets: { "khb-authoring": { mode: "minor" } },
    });
    expect((await authoring(site)).versions?.map((v) => v.version)).toEqual([
      "1.3.2",
      "1.2.0",
    ]);
    const other = (await buildManifest(env, site)).docsets.find(
      (d) => d.id === "zzz",
    )!;
    expect(other).not.toHaveProperty("versions");
  });
});

describe("configResponse", () => {
  it("mirrors the CLI's config.json shape", async () => {
    const res = configResponse(TEST_CONFIG.site.config);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.externalSources).toBe("boolean");
    expect(typeof body.pwa).toBe("boolean");
    expect(body).not.toHaveProperty("prefetch");
    expect(body).not.toHaveProperty("prefetchLocked");
  });

  it("passes through the optional offline-prefetch settings", async () => {
    const res = configResponse({
      externalSources: false,
      pwa: true,
      home: "docs:index",
      prefetch: true,
      prefetchLocked: true,
    });
    expect(await res.json()).toEqual({
      externalSources: false,
      pwa: true,
      home: "docs:index",
      prefetch: true,
      prefetchLocked: true,
    });
  });
});
