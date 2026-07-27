import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "test/config.test.ts",
      "test/cli.test.ts",
    ],
    poolOptions: {
      workers: {
        // The DOCSETS binding comes from the package's test-only Wrangler
        // config, so tests run against workerd-local R2.
        wrangler: { configPath: "./wrangler.toml" },
        // Per-test storage snapshotting needs host features that sandboxed CI
        // may lack; the tests use disjoint key prefixes instead, and a single
        // sequential worker keeps files from interleaving on shared storage.
        isolatedStorage: false,
        singleWorker: true,
      },
    },
  },
});
