import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const cli = join(process.cwd(), "dist", "cli.js");

const configYaml = `schema: 1
site:
  config:
    externalSources: true
publishers:
  - repository: acme/docs
    ref: refs/heads/main
    docsets: [acme-docs]
`;

describe("khb-cf-registry CLI", () => {
  it("validates and prepares runtime config plus viewer assets", async () => {
    const dir = await mkdtemp(join(tmpdir(), "khb-registry-cli-"));
    const config = join(dir, "khb-registry.yml");
    const viewer = join(dir, "viewer");
    const out = join(dir, "out");
    await writeFile(config, configYaml);
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(viewer, { recursive: true }),
    );
    await writeFile(join(viewer, "index.html"), "<!doctype html>");

    const validated = await execFile(process.execPath, [
      cli,
      "validate",
      config,
    ]);
    expect(validated.stdout).toContain("Valid registry configuration");

    await execFile(process.execPath, [
      cli,
      "prepare",
      config,
      "--out",
      out,
      "--viewer",
      viewer,
    ]);
    expect((await stat(join(out, "public", "index.html"))).isFile()).toBe(true);
    expect(JSON.parse(await readFile(join(out, "config.json"), "utf8")))
      .toMatchObject({
        schema: 1,
        publishers: [{ repository: "acme/docs" }],
      });
  });

  it("returns a non-zero exit for invalid YAML configuration", async () => {
    const dir = await mkdtemp(join(tmpdir(), "khb-registry-cli-bad-"));
    const config = join(dir, "khb-registry.yml");
    await writeFile(config, "schema: 2\nsite: {}\npublishers: []\n");
    await expect(
      execFile(process.execPath, [cli, "validate", config]),
    ).rejects.toMatchObject({ code: 1 });
  });
});
