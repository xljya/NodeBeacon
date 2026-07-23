import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const PORT = Number(process.env.E2E_PORT ?? 4173);
const E2E_STATE_DIR = resolve("e2e/.tmp");
export const BASE_URL = `http://localhost:${PORT}`;

// Owner credentials injected into the dev API for the lifetime of the test
// run only — never used outside webServer.env, never persisted anywhere.
export const E2E_OWNER_EMAIL = "owner@e2e.test";
export const E2E_OWNER_PASSWORD = "e2e-test-password-123";

export default defineConfig({
  testDir: "./e2e",
  // Serial: the API rate-limits /api/auth/login to 5/min, which parallel
  // workers hammering login in every spec would otherwise trip.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },

  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
    { name: "edge", use: { ...devices["Desktop Edge"], channel: "msedge" }, dependencies: ["setup"] },
    { name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" }, dependencies: ["setup"] }
  ],

  webServer: [
    {
      command: "node scripts/prepare-e2e.mjs && pnpm --filter @nodebeacon/shared build && pnpm --filter @nodebeacon/api dev",
      url: "http://localhost:3001/healthz",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe",
      env: {
        NODE_ENV: "development",
        WEB_ORIGIN: BASE_URL,
        COOKIE_SECRET: "e2e-test-cookie-secret-0123456789ab",
        INITIAL_OWNER_EMAIL: E2E_OWNER_EMAIL,
        INITIAL_OWNER_PASSWORD: E2E_OWNER_PASSWORD,
        PROMETHEUS_URL: "",
        GITHUB_CLIENT_ID: "",
        GITHUB_CLIENT_SECRET: "",
        ALLOW_REGISTER: "false",
        NODEBEACON_DATABASE_PATH: resolve(E2E_STATE_DIR, "nodebeacon.db"),
        NODEBEACON_NODE_CONFIG: resolve(E2E_STATE_DIR, "nodes.yaml"),
        NODEBEACON_NODE_CONFIG_SEED: resolve(E2E_STATE_DIR, "nodes.seed.yaml"),
        NODEBEACON_BACKUP_SUCCESS_PATH: resolve(E2E_STATE_DIR, "backup-last-success.timestamp")
      }
    },
    {
      command: `pnpm --filter @nodebeacon/web exec vite --host 0.0.0.0 --port ${PORT} --strictPort`,
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      stdout: "pipe"
    }
  ]
});
