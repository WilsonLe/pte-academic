import { defineConfig } from "@playwright/test";
const comparison = process.env.PTE_TEST_COMPARISON === "1";
const port = Number(process.env.PTE_TEST_PORT || 4178);
const subpathPort = Number(process.env.PTE_TEST_SUBPATH_PORT || 4180);
const subpath = process.env.PTE_TEST_SUBPATH === "1";
export default defineConfig({
  testDir: "tests",
  testMatch: comparison
    ? "comparison.spec.ts"
    : subpath
      ? "subpath.spec.ts"
      : /(?:practice|speech-review|review)\.spec\.ts$/,
  outputDir: comparison
    ? subpath
      ? "test-results/comparison-subpath"
      : "test-results/comparison"
    : subpath
      ? "test-results/subpath"
      : "test-results/practice",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: subpath
      ? `http://127.0.0.1:${subpathPort}`
      : `http://127.0.0.1:${port}`,
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
      ? `npm run build:subpath && npm run preview:subpath -- --port ${subpathPort} --strictPort`
      : `npm run preview -- --port ${port} --strictPort`,
    url: subpath
      ? `http://127.0.0.1:${subpathPort}/pte-academic/`
      : `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
