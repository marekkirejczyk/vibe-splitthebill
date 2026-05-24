import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/artifacts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    video: { mode: "on", size: { width: 393, height: 852 } },
    screenshot: "off",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node e2e/serve.mjs web-dist 4173",
    url: "http://127.0.0.1:4173",
    timeout: 15_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 393, height: 852 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
