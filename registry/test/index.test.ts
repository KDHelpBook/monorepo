import { describe, expect, it, vi } from "vitest";
import { createRegistry } from "../src";
import { TEST_CONFIG } from "./fixtures";

describe("createRegistry", () => {
  it("serves instance config without global configuration imports", async () => {
    const handler = createRegistry({
      ...TEST_CONFIG,
      site: {
        config: {
          externalSources: false,
          pwa: true,
          prefetch: true,
        },
      },
    });
    const response = await handler.fetch!(
      new Request("https://registry.test/config.json"),
      {} as never,
      { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as never,
    );
    expect(await response.json()).toEqual({
      externalSources: false,
      pwa: true,
      prefetch: true,
    });
  });
});
