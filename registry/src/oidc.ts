/**
 * GitHub Actions OIDC verification. A publishing workflow requests a short-
 * lived JWT from GitHub's token service (audience = this registry) and sends
 * it as the Bearer token; we verify signature (against GitHub's JWKS), issuer,
 * audience, and expiry, then hand the claims to the permission map. No secrets
 * are shared with publishing repositories.
 */

import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import type { ActionsClaims } from "./types";

export const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";

// Module scope: the JWKS (and its cooldown/cache) persists per isolate.
let remoteJwks: JWTVerifyGetKey | undefined;
function githubJwks(): JWTVerifyGetKey {
  remoteJwks ??= createRemoteJWKSet(
    new URL(`${GITHUB_ISSUER}/.well-known/jwks`),
  );
  return remoteJwks;
}

/**
 * Verify an Actions OIDC token and return its claims. Throws on any failure
 * (bad signature, wrong issuer/audience, expired). `getKey` is injectable so
 * tests can verify against a locally-generated JWKS.
 */
export async function verifyActionsToken(
  token: string,
  audience: string,
  getKey: JWTVerifyGetKey = githubJwks(),
): Promise<ActionsClaims> {
  const { payload } = await jwtVerify(token, getKey, {
    issuer: GITHUB_ISSUER,
    audience,
  });
  if (typeof payload.repository !== "string") {
    throw new Error("token has no repository claim");
  }
  return {
    repository: payload.repository,
    ref: typeof payload.ref === "string" ? payload.ref : undefined,
    environment:
      typeof payload.environment === "string" ? payload.environment : undefined,
    sub: payload.sub,
  };
}
