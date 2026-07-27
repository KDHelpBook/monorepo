/**
 * The registry's authorization map: which repository (on which ref /
 * environment) may publish which docset ids. This is the isolation boundary
 * between projects — object keys are derived from the *map*, never from the
 * request alone, so an authorized repo cannot write outside its own docsets.
 */

import type { ActionsClaims, PermissionsConfig, Publisher } from "./types";

function matches(p: Publisher, claims: ActionsClaims): boolean {
  if (p.repository !== claims.repository) return false;
  if (p.ref != null && p.ref !== claims.ref) return false;
  if (p.environment != null && p.environment !== claims.environment)
    return false;
  return true;
}

/** The docset ids the caller may publish — the union across matching entries. */
export function allowedDocsets(
  claims: ActionsClaims,
  config: PermissionsConfig,
): Set<string> {
  const out = new Set<string>();
  for (const p of config.publishers) {
    if (matches(p, claims)) for (const id of p.docsets) out.add(id);
  }
  return out;
}

/** Whether any entry matching the claims allows `?force=1` for this docset. */
export function forceAllowed(
  claims: ActionsClaims,
  config: PermissionsConfig,
  docsetId: string,
): boolean {
  return config.publishers.some(
    (p) => matches(p, claims) && p.force === true && p.docsets.includes(docsetId),
  );
}
