/**
 * Serving `.khb`/`.khba` from R2 with the exact transport contract the viewer's
 * streaming path expects (viewer-ts/src/data/streaming.ts `HttpRangeReader`):
 * a `GET` with `Range: bytes=a-b` MUST come back `206` with a correct
 * `Content-Range: bytes a-b/<total>` (the probe is `bytes=0-0` and parses the
 * total from it — no HEAD, no Accept-Ranges). Bodies are always raw bytes:
 * Range addresses SQLite pages, so no Content-Encoding, ever. CORS must expose
 * Content-Range and allow the Range request header (it is not CORS-safelisted,
 * so cross-origin viewers preflight).
 */

import type { Env, LatestPointer } from "./types";

export function corsHeaders(headers: Headers = new Headers()): Headers {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Expose-Headers",
    "Content-Range, Content-Length, ETag",
  );
  return headers;
}

export function preflight(): Response {
  const headers = corsHeaders();
  headers.set("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Range, Authorization, Content-Type");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(null, { status: 204, headers });
}

/** A JSON error/info response with CORS attached. */
export function json(status: number, body: unknown): Response {
  const headers = corsHeaders();
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body, null, 2) + "\n", { status, headers });
}

/** Single-range parse (`bytes=a-b` | `bytes=a-` | `bytes=-n`) against `size`.
 *  Returns inclusive offsets, null for "no/ignorable header", or "invalid". */
export function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null; // multi-range or malformed: serve the whole file (200)
  const [, a, b] = m;
  if (a === "" && b === "") return null;
  if (a === "") {
    // suffix: last n bytes
    const n = Number(b);
    if (n === 0) return "invalid";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(a);
  const end = b === "" ? size - 1 : Number(b);
  if (start >= size || end < start) return "invalid";
  return { start, end: Math.min(end, size - 1) };
}

const resolveLatest = async (
  env: Env,
  id: string,
): Promise<LatestPointer | null> => {
  const obj = await env.DOCSETS.get(`docsets/${id}/latest.json`);
  return obj ? ((await obj.json()) as LatestPointer) : null;
};

/** `GET /d/<id>/<version|latest>/<filename>` */
export async function serveDocset(
  request: Request,
  env: Env,
  id: string,
  version: string,
  filename: string,
): Promise<Response> {
  if (version === "latest") {
    const latest = await resolveLatest(env, id);
    if (!latest) return json(404, { error: "unknown docset" });
    version = latest.version;
  }
  const key = `docsets/${id}/${version}/${filename}`;
  const head = await env.DOCSETS.head(key);
  if (!head) return json(404, { error: "not found" });
  const size = head.size;

  const headers = corsHeaders();
  headers.set("Content-Type", "application/octet-stream");
  headers.set("Accept-Ranges", "bytes");
  if (head.httpEtag) headers.set("ETag", head.httpEtag);
  // Versioned paths are immutable; `latest` was already resolved to one above,
  // but the *URL* the client used decides its cacheability.
  headers.set(
    "Cache-Control",
    request.url.includes("/latest/")
      ? "no-cache"
      : "public, max-age=31536000, immutable",
  );

  const range = parseRange(request.headers.get("Range"), size);
  if (range === "invalid") {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  if (!range) {
    const obj = await env.DOCSETS.get(key);
    if (!obj) return json(404, { error: "not found" });
    headers.set("Content-Length", String(size));
    return new Response(obj.body, { status: 200, headers });
  }
  const length = range.end - range.start + 1;
  const obj = await env.DOCSETS.get(key, {
    range: { offset: range.start, length },
  });
  if (!obj) return json(404, { error: "not found" });
  // R2 returns only the requested bytes but no Content-Range — synthesize it.
  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
  headers.set("Content-Length", String(length));
  return new Response(obj.body, { status: 206, headers });
}
