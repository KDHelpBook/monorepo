/**
 * The dynamic `docsets.json` (and `config.json`): generated on request from
 * the per-docset `latest.json` pointers plus config/site.json — the same
 * manifest shape `khb pack` writes (compiler/cli/src/publish.rs), with every
 * entry marked `streaming: true` and `file` pointing at the worker's Range-
 * capable `/d/…` routes (relative paths: the viewer resolves them against its
 * own origin, and the manifest is served same-origin with the viewer assets).
 */

import siteJson from "../config/site.json";
import { corsHeaders } from "./serve";
import type { Env, LatestPointer, SiteConfig } from "./types";

const site = siteJson as SiteConfig;

interface ManifestEntry {
  file: string;
  id: string;
  title: string;
  language: string;
  collection: string;
  version?: string;
  attachments?: string[];
  streaming: true;
}

async function listPointers(env: Env): Promise<LatestPointer[]> {
  const listing = await env.DOCSETS.list({
    prefix: "docsets/",
    delimiter: "/",
  });
  const pointers = await Promise.all(
    listing.delimitedPrefixes.map(async (prefix) => {
      const obj = await env.DOCSETS.get(`${prefix}latest.json`);
      return obj ? ((await obj.json()) as LatestPointer) : null;
    }),
  );
  return pointers.filter((p): p is LatestPointer => p !== null);
}

export async function buildManifest(
  env: Env,
): Promise<{ docsets: ManifestEntry[]; folders?: unknown[] }> {
  const pointers = await listPointers(env);
  const order = site.order ?? [];
  const rank = (id: string): number => {
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  pointers.sort((a, b) => rank(a.id) - rank(b.id));
  const docsets = pointers.map((p): ManifestEntry => {
    const base = `d/${p.id}/${p.version}/`;
    return {
      file: base + p.file,
      id: p.id,
      title: p.title,
      language: p.language,
      collection: p.collection,
      ...(p.version ? { version: p.version } : {}),
      ...(p.attachments.length
        ? { attachments: p.attachments.map((a) => base + a) }
        : {}),
      streaming: true,
    };
  });
  const folders = site.folders;
  return folders?.length ? { docsets, folders } : { docsets };
}

const jsonResponse = (body: unknown): Response => {
  const headers = corsHeaders();
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-cache, s-maxage=60");
  return new Response(JSON.stringify(body, null, 2) + "\n", { headers });
};

/** `GET /docsets.json`, with a short shared cache (purged on finalize). */
export async function manifestResponse(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const cacheKey = new URL(request.url).origin + "/docsets.json";
  try {
    const hit = await caches.default.match(cacheKey);
    if (hit) return hit;
  } catch {
    /* no cache API (unit tests) — build every time */
  }
  const res = jsonResponse(await buildManifest(env));
  try {
    ctx.waitUntil(caches.default.put(cacheKey, res.clone()));
  } catch {
    /* best-effort */
  }
  return res;
}

/** `GET /config.json` — the viewer profile, from site.json. */
export function configResponse(): Response {
  const { externalSources = true, pwa = false, home } = site.config ?? {};
  return jsonResponse({ externalSources, pwa, ...(home ? { home } : {}) });
}
