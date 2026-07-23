import { describe, expect, it } from "vitest";
import { allowedDocsets, forceAllowed } from "../src/permissions";
import type { PermissionsConfig } from "../src/types";

const CONFIG: PermissionsConfig = {
  schema: 1,
  audience: "https://docs.example.com",
  publishers: [
    {
      repository: "acme/widgets",
      ref: "refs/heads/main",
      docsets: ["widgets", "widgets-api"],
    },
    { repository: "acme/widgets", ref: null, docsets: ["widgets-nightly"] },
    {
      repository: "acme/gadgets",
      environment: "production",
      docsets: ["gadgets"],
      force: true,
    },
  ],
};

describe("allowedDocsets", () => {
  it("unions matching entries", () => {
    const got = allowedDocsets(
      { repository: "acme/widgets", ref: "refs/heads/main" },
      CONFIG,
    );
    expect([...got].sort()).toEqual([
      "widgets",
      "widgets-api",
      "widgets-nightly",
    ]);
  });

  it("gates on ref when the entry pins one", () => {
    const got = allowedDocsets(
      { repository: "acme/widgets", ref: "refs/heads/feature" },
      CONFIG,
    );
    expect([...got]).toEqual(["widgets-nightly"]); // only the any-ref entry
  });

  it("gates on environment when the entry pins one", () => {
    expect(
      allowedDocsets({ repository: "acme/gadgets" }, CONFIG).size,
    ).toBe(0);
    expect([
      ...allowedDocsets(
        { repository: "acme/gadgets", environment: "production" },
        CONFIG,
      ),
    ]).toEqual(["gadgets"]);
  });

  it("denies by default", () => {
    expect(allowedDocsets({ repository: "evil/repo" }, CONFIG).size).toBe(0);
  });
});

describe("forceAllowed", () => {
  it("requires an explicit force flag on a matching entry", () => {
    const gadgets = {
      repository: "acme/gadgets",
      environment: "production",
    };
    expect(forceAllowed(gadgets, CONFIG, "gadgets")).toBe(true);
    expect(forceAllowed(gadgets, CONFIG, "widgets")).toBe(false);
    expect(
      forceAllowed(
        { repository: "acme/widgets", ref: "refs/heads/main" },
        CONFIG,
        "widgets",
      ),
    ).toBe(false);
  });
});
