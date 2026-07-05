import { defineConfig } from "vite";

export default defineConfig({
  // sql.js is CommonJS — let Vite pre-bundle it to ESM. Its wasm is imported
  // separately via `sql-wasm.wasm?url`, so no exclusion is needed.
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
