import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      // The DOCSETS binding comes from the package's test-only Wrangler config,
      // so tests run against workerd-local R2.
      wrangler: { configPath: "./wrangler.toml" },
    }),
  ],
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "test/config.test.ts", "test/cli.test.ts"],
    // Tests use disjoint key prefixes; one worker prevents shared R2 test data
    // from interleaving.
    fileParallelism: false,
    isolate: false,
  },
});
