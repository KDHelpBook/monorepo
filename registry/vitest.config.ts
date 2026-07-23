import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        // Bindings (the DOCSETS R2 bucket, REGISTRY_AUDIENCE) come from the
        // real wrangler config, so tests run against workerd-local R2.
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
