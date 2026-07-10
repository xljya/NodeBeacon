import { defineConfig, devices } from "@playwright/test";

const PORT = 5173;
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

  // Edge and Chrome are launched via their system install (channel), not a
  // Playwright-managed download — matches what's actually on this machine.
  // `pnpm test:e2e` only runs "edge" by default; pass --project=chrome for a
  // cross-browser spot check (running both in one invocation doubles the
  // real logins below and can trip the API's 5/min rate limit).
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "edge", use: { ...devices["Desktop Edge"], channel: "msedge" }, dependencies: ["setup"] },
    { name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" }, dependencies: ["setup"] }
  ],

  webServer: {
    command: "pnpm dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: "pipe",
    env: {
      NODE_ENV: "development",
      COOKIE_SECRET: "e2e-test-cookie-secret-0123456789ab",
      INITIAL_OWNER_EMAIL: E2E_OWNER_EMAIL,
      INITIAL_OWNER_PASSWORD: E2E_OWNER_PASSWORD,
      PROMETHEUS_URL: "",
      GITHUB_CLIENT_ID: "",
      GITHUB_CLIENT_SECRET: "",
      ALLOW_REGISTER: "false"
    }
  }
});
