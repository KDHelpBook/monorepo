/**
 * The KD Help Book registry worker. Routes:
 *
 *   GET  /docsets.json                       dynamic manifest (R2 + site.json)
 *   GET  /config.json                        viewer profile (site.json)
 *   GET  /d/<id>/<version|latest>/<file>     Range-capable docset bytes
 *   PUT  /publish/<id>/<version>/<file>      OIDC-authorized upload
 *   POST /publish/<id>/<version>             OIDC-authorized finalize
 *   *    /mcp                                reserved (501) — future MCP server
 *   *                                        static viewer assets
 *
 * Everything else (including `/`) falls through to the Workers Static Assets
 * binding, which serves the built viewer copied into ./public at deploy time.
 */

import { configResponse, manifestResponse } from "./manifest";
import { handleFinalize, handleUpload } from "./publish";
import { json, preflight, serveDocset } from "./serve";
import type { Env, PermissionsConfig, RegistryConfig } from "./types";

export type {
  Env,
  LatestPointer,
  PermissionsConfig,
  PublishedVersion,
  Publisher,
  RegistryConfig,
  SiteConfig,
  VersionsPolicy,
  VersionsRule,
} from "./types";

/** Build an isolated Worker handler for one validated registry instance. */
export function createRegistry(
  config: RegistryConfig,
): ExportedHandler<Env> {
  const permissions: PermissionsConfig = { publishers: config.publishers };

  return {
    async fetch(
      request: Request,
      env: Env,
      ctx: ExecutionContext,
    ): Promise<Response> {
      const path = new URL(request.url).pathname;
      if (request.method === "OPTIONS") return preflight();

      if (path === "/docsets.json" && request.method === "GET") {
        return manifestResponse(request, env, ctx, config.site);
      }
      if (path === "/config.json" && request.method === "GET") {
        return configResponse(config.site.config);
      }

      const d = /^\/d\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(path);
      if (d && request.method === "GET") {
        return serveDocset(request, env, d[1]!, d[2]!, d[3]!);
      }

      const up = /^\/publish\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(path);
      if (up && request.method === "PUT") {
        return handleUpload(
          request,
          env,
          up[1]!,
          up[2]!,
          up[3]!,
          permissions,
        );
      }
      const fin = /^\/publish\/([^/]+)\/([^/]+)$/.exec(path);
      if (fin && request.method === "POST") {
        return handleFinalize(
          request,
          env,
          fin[1]!,
          fin[2]!,
          permissions,
        );
      }
      if (path.startsWith("/publish")) {
        return json(405, { error: "use PUT (upload) or POST (finalize)" });
      }

      if (path === "/mcp" || path.startsWith("/mcp/")) {
        return json(501, { error: "MCP server not implemented yet" });
      }

      if (env.ASSETS) return env.ASSETS.fetch(request);
      return json(404, { error: "not found" });
    },
  };
}
