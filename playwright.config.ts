import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:3218" },
  webServer: {
    command: "npm run dev:fake",
    url: "http://127.0.0.1:3218/agents",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
