import type { RegistryConfig } from "../src/types";

export const TEST_ORIGIN = "https://registry.test";

export const TEST_CONFIG: RegistryConfig = {
  schema: 1,
  site: {
    order: ["khb-authoring", "khb-publishing"],
    folders: [
      {
        id: "khb",
        title: "KD Help Book",
        titles: { pl: "KD Help Book" },
        children: [{ collection: "khb-docs" }],
      },
    ],
    config: {
      externalSources: true,
      pwa: false,
    },
  },
  publishers: [
    {
      repository: "KDHelpBook/monorepo",
      ref: "refs/heads/main",
      environment: null,
      docsets: ["khb-authoring", "khb-publishing"],
      force: false,
    },
  ],
};
