import type { FastifyInstance } from "fastify";
import { createApp } from "../src/server.js";

export const OWNER_EMAIL = "owner@test.dev";
export const OWNER_PASSWORD = "test-password-123";

/**
 * Builds the real app with test env vars. loadEnv() reads process.env inside
 * createApp, so we set values first and restore the originals right after.
 * Pass `PROMETHEUS_URL` (or any override) per test; "" means "unset".
 */
export async function buildTestApp(
  overrides: Record<string, string> = {}
): Promise<FastifyInstance> {
  const defaults: Record<string, string> = {
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    COOKIE_SECRET: "test-cookie-secret-0123456789abcdef",
    INITIAL_OWNER_EMAIL: OWNER_EMAIL,
    INITIAL_OWNER_PASSWORD: OWNER_PASSWORD,
    PROMETHEUS_URL: "",
    GITHUB_CLIENT_ID: "",
    GITHUB_CLIENT_SECRET: "",
    ALERTMANAGER_URL: "",
    ALERTMANAGER_WEBHOOK_TOKEN: "",
    ...overrides
  };

  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(defaults)) {
    saved.set(key, process.env[key]);
    if (value === "") delete process.env[key];
    else process.env[key] = value;
  }

  try {
    const { app } = await createApp();
    await app.ready();
    return app;
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** Logs in as the env-provisioned owner and returns the session cookie jar. */
export async function loginOwner(app: FastifyInstance): Promise<Record<string, string>> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    payload: { email: OWNER_EMAIL, password: OWNER_PASSWORD }
  });
  if (res.statusCode !== 200) {
    throw new Error(`owner login failed in test setup: ${res.statusCode} ${res.body}`);
  }
  const session = res.cookies.find((cookie) => cookie.name === "nb_session");
  if (!session) throw new Error("login did not set the nb_session cookie");
  return { nb_session: session.value };
}
