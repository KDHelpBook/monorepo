import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs so the build works whether it's served from a domain root
  // or a GitHub Pages project subpath (e.g. /kdhelp/).
  base: "./",
  // sql.js is CommonJS — pre-bundle it to ESM *eagerly* at server start (via
  // `include`) so a page reload never races an on-demand optimize (which would
  // transiently break the main module and leave the page unstyled). Its wasm is
  // imported separately via `sql-wasm.wasm?url`.
  optimizeDeps: { include: ["sql.js"] },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
