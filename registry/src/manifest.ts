/**
 * The dynamic `docsets.json` (and `config.json`): generated on request from
 * the per-docset `latest.json` pointers plus the instance config — the same
 * manifest shape `khb pack` writes (compiler/cli/src/publish.rs), with every
 * entry marked `streaming: true` and `file` pointing at the worker's Range-
 * capable `/d/…` routes (relative paths: the viewer resolves them against its
 * own origin, and the manifest is served same-origin with the viewer assets).
 */

import { corsHeaders } from "./serve";
import type { Env, LatestPointer, SiteConfig } from "./types";
import { ruleFor, selectEditions } from "./versions";

/** One older edition of an entry's book, offered in the viewer's version
 *  switcher. Its metadata is the edition's own, not the entry's. */
interface ManifestEdition {
  version: string;
  file: string;
  title: string;
  language: string;
  collection: string;
  hash?: string;
  attachments?: string[];
  publishedAt?: string;
}

interface ManifestEntry {
  file: string;
  id: string;
  title: string;
  language: string;
  collection: string;
  version?: string;
  hash?: string;
  attachments?: string[];
  streaming: true;
  versions?: ManifestEdition[];
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
  site: SiteConfig,
): Promise<{ docsets: ManifestEntry[]; folders?: unknown[] }> {
  const pointers = await listPointers(env);
  const order = site.order ?? [];
  const rank = (id: string): number => {
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  pointers.sort((a, b) => rank(a.id) - rank(b.id));
  const docsets = pointers.map((p): ManifestEntry => {
    const serve = (version: string, file: string): string =>
      `d/${p.id}/${version}/${file}`;
    // Older editions the site's policy still offers; the current one is this entry.
    const editions = selectEditions(p, ruleFor(site.versions, p.id)).map(
      (v): ManifestEdition => ({
        version: v.version,
        file: serve(v.version, v.file),
        title: v.title,
        language: v.language,
        collection: v.collection,
        ...(v.hash ? { hash: v.hash } : {}),
        ...(v.attachments.length
          ? { attachments: v.attachments.map((a) => serve(v.version, a)) }
          : {}),
        ...(v.publishedAt ? { publishedAt: v.publishedAt } : {}),
      }),
    );
    return {
      file: serve(p.version, p.file),
      id: p.id,
      title: p.title,
      language: p.language,
      collection: p.collection,
      ...(p.version ? { version: p.version } : {}),
      ...(p.hash ? { hash: p.hash } : {}),
      ...(p.attachments.length
        ? { attachments: p.attachments.map((a) => serve(p.version, a)) }
        : {}),
      streaming: true,
      ...(editions.length ? { versions: editions } : {}),
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
  site: SiteConfig,
): Promise<Response> {
  const cacheKey = new URL(request.url).origin + "/docsets.json";
  try {
    const hit = await caches.default.match(cacheKey);
    if (hit) return hit;
  } catch {
    /* no cache API (unit tests) — build every time */
  }
  const res = jsonResponse(await buildManifest(env, site));
  try {
    ctx.waitUntil(caches.default.put(cacheKey, res.clone()));
  } catch {
    /* best-effort */
  }
  return res;
}

/** `GET /config.json` — the viewer profile, from site.json. The optional
 *  argument keeps the shape directly testable without mutating imported config. */
export function configResponse(
  config?: SiteConfig["config"],
): Response {
  const {
    externalSources = true,
    pwa = false,
    home,
    prefetch = false,
    prefetchLocked = false,
  } = config ?? {};
  return jsonResponse({
    externalSources,
    pwa,
    ...(home ? { home } : {}),
    ...(prefetch ? { prefetch } : {}),
    ...(prefetchLocked ? { prefetchLocked } : {}),
  });
}
