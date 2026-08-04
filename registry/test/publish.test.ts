import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { handleFinalize, handleUpload } from "../src/publish";
import type { LatestPointer } from "../src/types";
import { TEST_CONFIG, TEST_ORIGIN } from "./fixtures";
import { fakeKhb, makeIssuer, type TestIssuer } from "./helpers";

const REPO = "KDHelpBook/monorepo";
const REF = "refs/heads/main";
const ID = "khb-authoring";

let issuer: TestIssuer;
beforeAll(async () => {
  issuer = await makeIssuer(TEST_ORIGIN);
});

const upload = async (opts: {
  id?: string;
  version?: string;
  file?: string;
  body?: Uint8Array;
  token?: string;
  query?: string;
  origin?: string;
}): Promise<Response> => {
  const id = opts.id ?? ID;
  const version = opts.version ?? "1.0.0";
  const file = opts.file ?? `${id}.khb`;
  const token =
    opts.token ?? (await issuer.sign({ repository: REPO, ref: REF }));
  return handleUpload(
    new Request(
      `${opts.origin ?? TEST_ORIGIN}/publish/${id}/${version}/${file}${opts.query ?? ""}`,
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
    { publishers: TEST_CONFIG.publishers },
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
    new Request(`${TEST_ORIGIN}/publish/${id}/${version}`, {
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
    { publishers: TEST_CONFIG.publishers },
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
      { publishers: TEST_CONFIG.publishers },
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

  it("derives the OIDC audience from the request origin", async () => {
    const customOrigin = "https://docs.acme.example";
    const accepted = await upload({
      version: "0.1.3",
      origin: customOrigin,
      token: await issuer.sign(
        { repository: REPO, ref: REF },
        { audience: customOrigin },
      ),
    });
    expect(accepted.status).toBe(200);

    const rejected = await upload({
      version: "0.1.4",
      origin: customOrigin,
    });
    expect(rejected.status).toBe(401);
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
    const current = await env.DOCSETS.head(`docsets/${ID}/1.1.0/${ID}.khb`);
    expect(pointer.hash).toBe(current!.etag);
    expect(pointer.versions[0]!.hash).toBeTruthy();
  });

  it("records the pointer format and the current edition's metadata", async () => {
    await upload({ version: "1.5.0" });
    await finalize({ version: "1.5.0" });

    const pointer = (await (await env.DOCSETS.get(
      `docsets/${ID}/latest.json`,
    ))!.json()) as LatestPointer;
    expect(pointer.schema).toBe(2);
    expect(pointer).toMatchObject({
      title: "Authoring",
      language: "en",
      collection: "khb",
    });
  });

  it("carries a superseded edition's own metadata down into versions[]", async () => {
    // The retitled release must not rewrite what the older edition was called:
    // the switcher names each edition as it was published.
    await upload({ id: "khb-publishing", version: "2.0.0" });
    await finalize({
      id: "khb-publishing",
      version: "2.0.0",
      body: {
        title: "Publishing",
        language: "en",
        collection: "khb",
        file: "khb-publishing.khb",
      },
    });
    await upload({ id: "khb-publishing", version: "2.1.0" });
    await finalize({
      id: "khb-publishing",
      version: "2.1.0",
      body: {
        title: "Publishing a book",
        language: "en",
        collection: "khb",
        file: "khb-publishing.khb",
      },
    });

    const pointer = (await (await env.DOCSETS.get(
      "docsets/khb-publishing/latest.json",
    ))!.json()) as LatestPointer;
    expect(pointer.title).toBe("Publishing a book");
    expect(pointer.versions[0]).toMatchObject({
      version: "2.0.0",
      title: "Publishing",
      language: "en",
      collection: "khb",
    });
  });

  it("defaults a missing collection to the docset id", async () => {
    await upload({ version: "1.6.0" });
    await finalize({
      version: "1.6.0",
      body: { title: "Authoring", language: "en", file: `${ID}.khb` },
    });
    const pointer = (await (await env.DOCSETS.get(
      `docsets/${ID}/latest.json`,
    ))!.json()) as LatestPointer;
    expect(pointer.collection).toBe(ID);
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
