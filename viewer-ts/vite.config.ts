import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs so the build works whether it's served from a domain root
  // or a GitHub Pages project subpath (e.g. /khb/).
  base: "./",
  // A per-build stamp versioning the config.json/docsets.json fetches: stable
  // within a deploy (HTTP caching keeps working), different across deploys (a
  // new build busts any service-worker copy of the manifests).
  define: {
    __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
