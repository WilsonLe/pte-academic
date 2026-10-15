import { defineConfig } from "@playwright/test";
const subpath = process.env.PTE_TEST_SUBPATH === "1";
export default defineConfig({
  testDir: "tests",
  testMatch: subpath ? "subpath.spec.ts" : "practice.spec.ts",
  outputDir: subpath ? "test-results/subpath" : "test-results/practice",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:4178",
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
    permissions: ["microphone"],
    trace: "retain-on-failure",
  },
  webServer: {
    command: subpath
      ? "npm run build:subpath && npm run preview:subpath"
      : "npm run preview",
    url: subpath
      ? "http://127.0.0.1:4180/pte-academic/"
      : "http://127.0.0.1:4178",
    reuseExistingServer: true,
  },
});
