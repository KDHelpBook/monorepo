/** Shared test fixtures: a fake .khb head and a locally-signed OIDC token. */

import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createLocalJWKSet, type JWTVerifyGetKey } from "jose";
import { GITHUB_ISSUER } from "../src/oidc";
import type { ActionsClaims } from "../src/types";

/** A plausible SQLite file: correct magic + page size 4096, n pages of zeros. */
export function fakeKhb(pages = 1): Uint8Array {
  const bytes = new Uint8Array(4096 * pages);
  const magic = "SQLite format 3\0";
  for (let i = 0; i < magic.length; i++) bytes[i] = magic.charCodeAt(i);
  bytes[16] = 0x10; // 4096 big-endian
  bytes[17] = 0x00;
  return bytes;
}

export interface TestIssuer {
  getKey: JWTVerifyGetKey;
  sign(
    claims: Partial<ActionsClaims>,
    opts?: { issuer?: string; audience?: string; expired?: boolean },
  ): Promise<string>;
}

/** An in-test OIDC issuer: keypair + local JWKS + GitHub-shaped JWT signer. */
export async function makeIssuer(audience: string): Promise<TestIssuer> {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "test-key";
  const getKey = createLocalJWKSet({ keys: [jwk] });
  return {
    getKey,
    async sign(claims, opts = {}) {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({ ...claims })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setIssuer(opts.issuer ?? GITHUB_ISSUER)
        .setAudience(opts.audience ?? audience)
        .setSubject("repo:test/test:ref:refs/heads/main")
        .setIssuedAt(opts.expired ? now - 7200 : now)
        .setExpirationTime(opts.expired ? now - 3600 : now + 600)
        .sign(privateKey);
    },
  };
}
