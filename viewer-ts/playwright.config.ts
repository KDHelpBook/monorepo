import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  timeout: 60_000,
  use: {
    baseURL: process.env.KHB_SMOKE_URL ?? "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
