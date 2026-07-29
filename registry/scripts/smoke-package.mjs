import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const tarball = process.argv[2];
if (!tarball) {
  throw new Error("usage: node scripts/smoke-package.mjs <package.tgz>");
}

const root = await mkdtemp(join(tmpdir(), "khb-registry-package-"));
execFileSync(
  "npm",
  ["install", "--ignore-scripts", "--no-audit", "--no-fund", resolve(tarball)],
  { cwd: root, stdio: "inherit" },
);

const packageRoot = join(root, "node_modules", "@kdhelpbook", "cf-registry");
const consumer = join(root, "consumer.mjs");
await writeFile(
  consumer,
  `import { createRegistry } from "@kdhelpbook/cf-registry";
import { validateRegistryConfig } from "@kdhelpbook/cf-registry/config";
const config = {
  schema: 1,
  site: { order: [], folders: [], config: { externalSources: true, pwa: false } },
  publishers: [{
    repository: "KDHelpBook/monorepo",
    ref: "refs/heads/main",
    environment: null,
    docsets: ["khb-authoring"],
    force: false
  }]
};
validateRegistryConfig(config);
if (typeof createRegistry(config).fetch !== "function") {
  throw new Error("createRegistry did not return a Worker handler");
}
`,
);
execFileSync(process.execPath, [consumer], { cwd: root, stdio: "inherit" });

const configFile = join(root, "khb-registry.yml");
await writeFile(
  configFile,
  `schema: 1
site:
  order: []
  folders: []
  config:
    externalSources: true
    pwa: false
publishers:
  - repository: KDHelpBook/monorepo
    ref: refs/heads/main
    environment: null
    docsets: [khb-authoring]
    force: false
`,
);

const cli = join(packageRoot, "dist", "cli.js");
const prepared = join(root, "prepared");
execFileSync(process.execPath, [cli, "validate", configFile], {
  stdio: "inherit",
});
execFileSync(
  process.execPath,
  [cli, "prepare", configFile, "--out", prepared],
  {
    stdio: "inherit",
  },
);

if (!existsSync(join(prepared, "public", "index.html"))) {
  throw new Error("prepare did not copy the packaged viewer");
}
if (!existsSync(join(prepared, "config.json"))) {
  throw new Error("prepare did not write config.json");
}

console.log("Registry package consumer smoke test passed.");
