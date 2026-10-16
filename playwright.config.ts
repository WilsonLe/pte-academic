import { defineConfig } from "@playwright/test";
const comparison = process.env.PTE_TEST_COMPARISON === "1";
const port = Number(
  process.env.PTE_TEST_PORT ||
    (process.env.PTE_TEST_SUBPATH === "1" ? 4180 : 4178),
);
const subpath = process.env.PTE_TEST_SUBPATH === "1";
export default defineConfig({
  testDir: "tests",
  testMatch: comparison
    ? "comparison.spec.ts"
    : subpath
      ? "subpath.spec.ts"
      : /(?:practice|speech-review)\.spec\.ts$/,
  outputDir: comparison
    ? "test-results/comparison"
    : subpath
      ? "test-results/subpath"
      : "test-results/practice",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
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
      ? `npm run build:subpath && npm run preview:subpath -- --port ${port}`
      : `npm run preview -- --port ${port}`,
    url: `http://127.0.0.1:${port}${subpath ? "/pte-academic/" : ""}`,
    reuseExistingServer: true,
  },
});
