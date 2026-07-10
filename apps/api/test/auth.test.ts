import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, OWNER_EMAIL, OWNER_PASSWORD } from "./helpers.js";

describe("auth routes (env-provisioned owner, persisted cookie session)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(() => app.close());

  it("reports password login enabled and GitHub disabled", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/config" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ passwordLoginEnabled: true, githubLoginEnabled: false });
  });

  it("rejects a missing payload with 400", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_request");
  });

  it("rejects wrong credentials with 401 and no cookie", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: OWNER_EMAIL, password: "wrong-password" }
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("invalid_credentials");
    expect(res.cookies.find((cookie) => cookie.name === "nb_session")).toBeUndefined();
  });

  it("issues an httpOnly session cookie on success and /me resolves the owner", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: OWNER_EMAIL, password: OWNER_PASSWORD }
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().user).toMatchObject({ id: "owner", email: OWNER_EMAIL, role: "owner" });

    const session = login.cookies.find((cookie) => cookie.name === "nb_session");
    expect(session).toBeDefined();
    expect(session?.httpOnly).toBe(true);

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { nb_session: session!.value }
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.role).toBe("owner");
  });

  it("returns 401 from /me without a session", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a tampered session cookie", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { nb_session: "forged-value.forged-signature" }
    });
    expect(res.statusCode).toBe(401);
  });

  it("revokes the server-side session on logout", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: OWNER_EMAIL, password: OWNER_PASSWORD }
    });
    const session = login.cookies.find((cookie) => cookie.name === "nb_session")!;

    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { nb_session: session.value }
    });
    expect(logout.statusCode).toBe(200);

    const replay = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      cookies: { nb_session: session.value }
    });
    expect(replay.statusCode).toBe(401);
  });

  it("keeps registration closed", async () => {
    const res = await app.inject({ method: "POST", url: "/api/auth/register", payload: {} });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("registration_disabled");
  });
});
