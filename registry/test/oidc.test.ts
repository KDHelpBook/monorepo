import { describe, expect, it } from "vitest";
import { verifyActionsToken } from "../src/oidc";
import { makeIssuer } from "./helpers";

const AUD = "https://docs.example.com";

describe("verifyActionsToken", () => {
  it("accepts a well-formed token and returns the claims", async () => {
    const issuer = await makeIssuer(AUD);
    const token = await issuer.sign({
      repository: "acme/widgets",
      ref: "refs/heads/main",
    });
    const claims = await verifyActionsToken(token, AUD, issuer.getKey);
    expect(claims.repository).toBe("acme/widgets");
    expect(claims.ref).toBe("refs/heads/main");
  });

  it("rejects a wrong audience", async () => {
    const issuer = await makeIssuer(AUD);
    const token = await issuer.sign(
      { repository: "acme/widgets" },
      { audience: "https://evil.example.com" },
    );
    await expect(verifyActionsToken(token, AUD, issuer.getKey)).rejects.toThrow();
  });

  it("rejects a wrong issuer", async () => {
    const issuer = await makeIssuer(AUD);
    const token = await issuer.sign(
      { repository: "acme/widgets" },
      { issuer: "https://evil.example.com" },
    );
    await expect(verifyActionsToken(token, AUD, issuer.getKey)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const issuer = await makeIssuer(AUD);
    const token = await issuer.sign(
      { repository: "acme/widgets" },
      { expired: true },
    );
    await expect(verifyActionsToken(token, AUD, issuer.getKey)).rejects.toThrow();
  });

  it("rejects a token signed by another key", async () => {
    const issuer = await makeIssuer(AUD);
    const rogue = await makeIssuer(AUD);
    const token = await rogue.sign({ repository: "acme/widgets" });
    await expect(verifyActionsToken(token, AUD, issuer.getKey)).rejects.toThrow();
  });

  it("rejects a token without a repository claim", async () => {
    const issuer = await makeIssuer(AUD);
    const token = await issuer.sign({});
    await expect(verifyActionsToken(token, AUD, issuer.getKey)).rejects.toThrow(
      /repository/,
    );
  });
});
