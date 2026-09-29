import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: process.env.TERN_WEB_TEST_URL || "http://127.0.0.1:3100",
    headless: true,
    colorScheme: "dark",
  },
  webServer: process.env.TERN_WEB_TEST_URL
    ? undefined
    : {
        command: process.env.TERN_WEB_TEST_DEV
          ? "npm run dev --workspace @tern-ai/web -- --hostname 127.0.0.1 --port 3100"
          : "npm run start --workspace @tern-ai/web -- --hostname 127.0.0.1 --port 3100",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
