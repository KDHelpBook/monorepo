import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { handleFinalize, handleUpload } from "../src/publish";
import type { LatestPointer } from "../src/types";
import { fakeKhb, makeIssuer, type TestIssuer } from "./helpers";

// These tests authorize against the real config/permissions.json — its first
// entry allows KDHelpBook/monorepo (refs/heads/main) to publish khb-authoring.
const REPO = "KDHelpBook/monorepo";
const REF = "refs/heads/main";
const ID = "khb-authoring";

let issuer: TestIssuer;
beforeAll(async () => {
  issuer = await makeIssuer(env.REGISTRY_AUDIENCE);
});

const upload = async (opts: {
  id?: string;
  version?: string;
  file?: string;
  body?: Uint8Array;
  token?: string;
  query?: string;
}): Promise<Response> => {
  const id = opts.id ?? ID;
  const version = opts.version ?? "1.0.0";
  const file = opts.file ?? `${id}.khb`;
  const token =
    opts.token ?? (await issuer.sign({ repository: REPO, ref: REF }));
  return handleUpload(
    new Request(
      `https://registry.test/publish/${id}/${version}/${file}${opts.query ?? ""}`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
        body: opts.body ?? fakeKhb(),
      },
    ),
    env,
    id,
    version,
    file,
    issuer.getKey,
  );
};

const finalize = async (opts: {
  id?: string;
  version?: string;
  body?: unknown;
  token?: string;
}): Promise<Response> => {
  const id = opts.id ?? ID;
  const version = opts.version ?? "1.0.0";
  const token =
    opts.token ?? (await issuer.sign({ repository: REPO, ref: REF }));
  return handleFinalize(
    new Request(`https://registry.test/publish/${id}/${version}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(
        opts.body ?? {
          title: "Authoring",
          language: "en",
          collection: "khb",
          file: `${id}.khb`,
        },
      ),
    }),
    env,
    id,
    version,
    issuer.getKey,
  );
};

describe("publish upload", () => {
  it("stores an authorized upload under the versioned key", async () => {
    const res = await upload({ version: "0.1.0" });
    expect(res.status).toBe(200);
    expect(await env.DOCSETS.head(`docsets/${ID}/0.1.0/${ID}.khb`)).toBeTruthy();
  });

  it("401s without a token and 403s an unauthorized docset id", async () => {
    const anon = await handleUpload(
      new Request("https://registry.test/publish/x/1/x.khb", {
        method: "PUT",
        body: fakeKhb(),
      }),
      env,
      "x",
      "1",
      "x.khb",
      issuer.getKey,
    );
    expect(anon.status).toBe(401);
    const other = await upload({ id: "someone-elses-docs", version: "0.1.0" });
    expect(other.status).toBe(403);
  });

  it("403s when the ref doesn't match the permission entry", async () => {
    const token = await issuer.sign({
      repository: REPO,
      ref: "refs/heads/feature",
    });
    const res = await upload({ token, version: "0.1.1" });
    expect(res.status).toBe(403);
  });

  it("400s a non-SQLite body and a path-ish filename", async () => {
    const bad = await upload({
      version: "0.1.2",
      body: new Uint8Array(4096).fill(7),
    });
    expect(bad.status).toBe(400);
    const evil = await upload({ version: "0.1.2", file: "..%2Fescape.khb" });
    expect(evil.status).toBe(400);
  });

  it("409s an overwrite of an existing immutable version", async () => {
    await upload({ version: "0.2.0" });
    const again = await upload({ version: "0.2.0" });
    expect(again.status).toBe(409);
    // force needs an entry with force:true — this publisher has force:false.
    const forced = await upload({ version: "0.2.0", query: "?force=1" });
    expect(forced.status).toBe(403);
  });
});

describe("publish finalize", () => {
  it("flips latest.json and folds prior versions newest-first", async () => {
    await upload({ version: "1.0.0" });
    expect((await finalize({ version: "1.0.0" })).status).toBe(200);
    await upload({ version: "1.1.0" });
    expect((await finalize({ version: "1.1.0" })).status).toBe(200);

    const pointer = (await (await env.DOCSETS.get(
      `docsets/${ID}/latest.json`,
    ))!.json()) as LatestPointer;
    expect(pointer.version).toBe("1.1.0");
    expect(pointer.file).toBe(`${ID}.khb`);
    expect(pointer.versions.map((v) => v.version)).toEqual(["1.0.0"]);
    expect(pointer.repository).toBe(REPO);
  });

  it("409s a re-publish of an already-published version", async () => {
    await upload({ version: "2.0.0" });
    await finalize({ version: "2.0.0" });
    expect((await finalize({ version: "2.0.0" })).status).toBe(409);
  });

  it("400s a finalize referencing files that were never uploaded", async () => {
    const res = await finalize({
      version: "3.0.0",
      body: {
        title: "Authoring",
        language: "en",
        file: "never-uploaded.khb",
      },
    });
    expect(res.status).toBe(400);
  });
});
