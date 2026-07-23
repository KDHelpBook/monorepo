import type { Env } from "../src/types";

declare module "cloudflare:test" {
  // Bindings from wrangler.toml, provided to tests by vitest-pool-workers.
  interface ProvidedEnv extends Env {}
}
