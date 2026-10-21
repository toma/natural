import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI === "true" ? 2 : 0,
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  use: { headless: true, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: "bun run packages/editor/src/server.ts",
      url: "http://127.0.0.1:43100",
      env: { NATURAL_PROJECT: "examples/arena-2d", PORT: "43100" },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "bun run examples/arena-2d/server-dev.ts",
      url: "http://127.0.0.1:43200",
      env: { PORT: "43200" },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "bun run examples/sandbox-3d/server-dev.ts",
      url: "http://127.0.0.1:43300",
      env: { PORT: "43300" },
      reuseExistingServer: !process.env.CI,
    },
    ...(process.env.NATURAL_FPS_TEST_URL
      ? []
      : [
          {
            command: "bun run examples/urban-raid/server-dev.ts",
            url: "http://127.0.0.1:43400",
            env: { PORT: "43400" },
            reuseExistingServer: !process.env.CI,
          },
        ]),
  ],
});
