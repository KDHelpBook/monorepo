import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  readRegistryConfig,
  validateRegistryConfig,
} from "../src/config";
import { TEST_CONFIG } from "./fixtures";

describe("registry configuration", () => {
  it("accepts the supported schema", () => {
    expect(validateRegistryConfig(TEST_CONFIG)).toEqual(TEST_CONFIG);
  });

  it("rejects unknown fields and unsafe publisher identifiers", () => {
    expect(() =>
      validateRegistryConfig({
        ...TEST_CONFIG,
        surprise: true,
      }),
    ).toThrow(/unknown property "surprise"/);
    expect(() =>
      validateRegistryConfig({
        ...TEST_CONFIG,
        publishers: [
          { repository: "missing-owner", docsets: ["../escape"] },
        ],
      }),
    ).toThrow(/pattern/);
  });

  it("rejects invalid refs and empty docset permission lists", () => {
    expect(() =>
      validateRegistryConfig({
        ...TEST_CONFIG,
        publishers: [
          {
            repository: "acme/docs",
            ref: "main",
            docsets: ["acme-docs"],
          },
        ],
      }),
    ).toThrow(/pattern/);
    expect(() =>
      validateRegistryConfig({
        ...TEST_CONFIG,
        publishers: [{ repository: "acme/docs", docsets: [] }],
      }),
    ).toThrow(/items/);
  });

  it("accepts a version policy, with per-docset overrides", () => {
    const config = {
      ...TEST_CONFIG,
      site: {
        ...TEST_CONFIG.site,
        versions: {
          mode: "minor",
          keep: 5,
          docsets: { "khb-authoring": { mode: "all" } },
        },
      },
    };
    expect(validateRegistryConfig(config)).toEqual(config);
  });

  it("rejects an unknown version mode, a zero keep, and stray keys", () => {
    const withVersions = (versions: unknown): unknown => ({
      ...TEST_CONFIG,
      site: { ...TEST_CONFIG.site, versions },
    });
    expect(() => validateRegistryConfig(withVersions({ mode: "newest" }))).toThrow(
      /enum|allowed values/,
    );
    expect(() => validateRegistryConfig(withVersions({ keep: 0 }))).toThrow(
      />= 1/,
    );
    expect(() =>
      validateRegistryConfig(withVersions({ mode: "all", trim: 2 })),
    ).toThrow(/unknown property "trim"/);
    expect(() =>
      validateRegistryConfig(
        withVersions({ docsets: { "../escape": { mode: "all" } } }),
      ),
    ).toThrow(/pattern/);
  });

  it("parses YAML from disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "khb-registry-config-"));
    const file = join(dir, "khb-registry.yml");
    await writeFile(
      file,
      `schema: 1
site:
  config:
    prefetch: false
publishers: []
`,
    );
    expect(await readRegistryConfig(file)).toMatchObject({
      schema: 1,
      publishers: [],
    });
  });

  it("ships a parseable editor schema", async () => {
    const filename = join(
      process.cwd(),
      "schema",
      "khb-registry.schema.json",
    );
    const raw = await readFile(filename, "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
