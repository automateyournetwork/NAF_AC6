import { defineConfig } from "@playwright/test";

// Not 8000 or 8765: on the owner's machine both belong to other local servers.
const PORT = 8791;

// End-to-end tests run against the committed build output, served as plain files.
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  timeout: 180_000,
  workers: 2,
  reporter: [["list"]],
  // A click that cannot happen fails in 15 seconds with its reason, not at the end of the test.
  use: { baseURL: `http://127.0.0.1:${PORT}/`, browserName: "chromium", actionTimeout: 15_000 },
  webServer: {
    command: `python3 -m http.server ${PORT} --bind 127.0.0.1 --directory dist`,
    url: `http://127.0.0.1:${PORT}/`,
    // Never reuse a server that is already there: it may be serving a different build.
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "ignore",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1920, height: 1080 } } },
    { name: "phone", use: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true } },
  ],
});
