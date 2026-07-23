/**
 * The publish API. Two steps so a multi-file publish (a `.khb` plus `.khba`
 * packs) lands atomically:
 *
 *   PUT  /publish/<id>/<version>/<filename>   (per file, Bearer = OIDC JWT)
 *   POST /publish/<id>/<version>              (finalize: metadata JSON)
 *
 * Files go to immutable keys `docsets/<id>/<version>/…`; nothing is visible to
 * readers until finalize writes the docset's `latest.json` pointer — a single-
 * key atomic write, so concurrent publishes of *different* docsets can't
 * conflict by construction (same-docset runs are serialized by the workflow's
 * `concurrency:` group; see examples/publish-docset.yml).
 */

import type { JWTVerifyGetKey } from "jose";
import permissionsJson from "../config/permissions.json";
import { checkKhbHead, HEAD_BYTES } from "./khb-check";
import { verifyActionsToken } from "./oidc";
import { allowedDocsets, forceAllowed } from "./permissions";
import { json } from "./serve";
import type {
  ActionsClaims,
  Env,
  LatestPointer,
  PermissionsConfig,
  PublishedVersion,
} from "./types";

const permissions = permissionsJson as PermissionsConfig;

/** Docset ids and versions stay path- and key-safe; filenames carry no dirs. */
const ID_RE = /^[a-z0-9][a-z0-9._-]*$/i;
const FILE_RE = /^[a-z0-9][a-z0-9._-]*\.(khb|khba)$/i;

interface AuthResult {
  claims: ActionsClaims;
  allowed: Set<string>;
}

async function authorize(
  request: Request,
  env: Env,
  docsetId: string,
  getKey?: JWTVerifyGetKey,
): Promise<AuthResult | Response> {
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return json(401, { error: "missing bearer token" });
  let claims: ActionsClaims;
  try {
    claims = await verifyActionsToken(token, env.REGISTRY_AUDIENCE, getKey);
  } catch (e) {
    return json(401, { error: `invalid token: ${(e as Error).message}` });
  }
  const allowed = allowedDocsets(claims, permissions);
  if (!allowed.has(docsetId)) {
    return json(403, {
      error: `repository ${claims.repository} may not publish docset ${docsetId}`,
    });
  }
  return { claims, allowed };
}

/** `PUT /publish/<id>/<version>/<filename>` — store one file (not yet visible). */
export async function handleUpload(
  request: Request,
  env: Env,
  id: string,
  version: string,
  filename: string,
  getKey?: JWTVerifyGetKey,
): Promise<Response> {
  if (!ID_RE.test(id) || !ID_RE.test(version) || version === "latest") {
    return json(400, { error: "invalid docset id or version" });
  }
  if (!FILE_RE.test(filename)) {
    return json(400, { error: "filename must be a plain *.khb or *.khba name" });
  }
  const auth = await authorize(request, env, id, getKey);
  if (auth instanceof Response) return auth;

  const key = `docsets/${id}/${version}/${filename}`;
  const force = new URL(request.url).searchParams.get("force") === "1";
  if (force && !forceAllowed(auth.claims, permissions, id)) {
    return json(403, { error: "force republish not allowed for this publisher" });
  }
  if (!force && (await env.DOCSETS.head(key))) {
    return json(409, {
      error: `version ${version} of ${id} already has ${filename} (immutable; bump the version)`,
    });
  }

  // Buffer the body: we must sanity-check the head before storing, and R2 needs
  // a known length. Docsets are single-digit-MB SQLite files — well within a
  // worker's memory; a streamed tee is the upgrade path if that ever changes.
  const body = new Uint8Array(await request.arrayBuffer());
  const err = checkKhbHead(body.slice(0, HEAD_BYTES), body.byteLength);
  if (err) return json(400, { error: err });

  await env.DOCSETS.put(key, body);
  return json(200, { stored: key, bytes: body.byteLength });
}

/** The finalize body — produced by the workflow from `khb inspect` output. */
interface FinalizeBody {
  title: string;
  language: string;
  collection?: string;
  file: string;
  attachments?: string[];
}

/** `POST /publish/<id>/<version>` — flip the docset's `latest.json` pointer. */
export async function handleFinalize(
  request: Request,
  env: Env,
  id: string,
  version: string,
  getKey?: JWTVerifyGetKey,
): Promise<Response> {
  if (!ID_RE.test(id) || !ID_RE.test(version) || version === "latest") {
    return json(400, { error: "invalid docset id or version" });
  }
  const auth = await authorize(request, env, id, getKey);
  if (auth instanceof Response) return auth;

  let meta: FinalizeBody;
  try {
    meta = (await request.json()) as FinalizeBody;
  } catch {
    return json(400, { error: "finalize body must be JSON" });
  }
  if (typeof meta.title !== "string" || typeof meta.language !== "string") {
    return json(400, { error: "finalize body needs title and language" });
  }
  if (typeof meta.file !== "string" || !FILE_RE.test(meta.file)) {
    return json(400, { error: "finalize body needs the uploaded .khb filename" });
  }
  const attachments = (meta.attachments ?? []).filter((f) => FILE_RE.test(f));

  // Every referenced object must have been uploaded to this version's prefix.
  for (const f of [meta.file, ...attachments]) {
    if (!(await env.DOCSETS.head(`docsets/${id}/${version}/${f}`))) {
      return json(400, { error: `file ${f} was not uploaded for this version` });
    }
  }

  const pointerKey = `docsets/${id}/latest.json`;
  const prevObj = await env.DOCSETS.get(pointerKey);
  const prev = prevObj ? ((await prevObj.json()) as LatestPointer) : null;
  const already =
    prev &&
    (prev.version === version || prev.versions.some((v) => v.version === version));
  if (already && !forceAllowed(auth.claims, permissions, id)) {
    return json(409, {
      error: `version ${version} of ${id} is already published (immutable; bump the version)`,
    });
  }

  const entry: PublishedVersion = {
    version,
    file: meta.file,
    attachments,
    publishedAt: new Date().toISOString(),
    repository: auth.claims.repository,
  };
  const pointer: LatestPointer = {
    id,
    title: meta.title,
    language: meta.language,
    collection: meta.collection || id,
    ...entry,
    versions: prev
      ? [
          // Fold the previous current edition in; drop a republished version.
          ...[
            {
              version: prev.version,
              file: prev.file,
              attachments: prev.attachments,
              publishedAt: prev.publishedAt,
              repository: prev.repository,
            },
            ...prev.versions,
          ].filter((v) => v.version !== version),
        ]
      : [],
  };
  await env.DOCSETS.put(pointerKey, JSON.stringify(pointer, null, 2));

  // The manifest is edge-cached briefly; drop it so the publish shows up now.
  try {
    const origin = new URL(request.url).origin;
    await caches.default.delete(`${origin}/docsets.json`);
  } catch {
    /* cache purge is best-effort */
  }
  return json(200, {
    published: { id, version },
    serve: `d/${id}/${version}/${meta.file}`,
  });
}
