import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, OWNER_EMAIL, OWNER_PASSWORD } from "./helpers.js";
import { generateTotpCode } from "../src/services/totpService.js";

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
    expect(res.headers["cache-control"]).toBe("no-store");
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

describe("TOTP login challenge", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(() => app.close());

  it("does not issue a session before the second factor and consumes recovery codes once", async () => {
    const ownerLogin = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: OWNER_EMAIL, password: OWNER_PASSWORD } });
    const ownerCookie = ownerLogin.cookies.find((cookie) => cookie.name === "nb_session")?.value;
    expect(ownerCookie).toBeTruthy();

    const setup = await app.inject({ method: "POST", url: "/api/admin/2fa/setup", cookies: { nb_session: ownerCookie! }, payload: { currentPassword: OWNER_PASSWORD } });
    expect(setup.statusCode).toBe(200);
    const secret = setup.json().secret as string;
    const confirm = await app.inject({ method: "POST", url: "/api/admin/2fa/confirm", cookies: { nb_session: ownerCookie! }, payload: { code: generateTotpCode(secret) } });
    expect(confirm.statusCode).toBe(200);
    const recoveryCode = confirm.json().recoveryCodes[0] as string;

    const firstStep = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: OWNER_EMAIL, password: OWNER_PASSWORD } });
    expect(firstStep.statusCode).toBe(202);
    expect(firstStep.cookies.find((cookie) => cookie.name === "nb_session")).toBeUndefined();
    const challengeCookie = firstStep.cookies.find((cookie) => cookie.name === "nb_login_challenge")?.value;
    expect(challengeCookie).toBeTruthy();
    const challengeState = await app.inject({ method: "GET", url: "/api/auth/challenge", cookies: { nb_login_challenge: challengeCookie! } });
    expect(challengeState.json()).toEqual({ required: true });

    const invalid = await app.inject({ method: "POST", url: "/api/auth/2fa", cookies: { nb_login_challenge: challengeCookie! }, payload: { code: "000000" } });
    expect(invalid.statusCode).toBe(401);

    const nextCode = generateTotpCode(secret, Date.now() + 30_000);
    const completed = await app.inject({ method: "POST", url: "/api/auth/2fa", cookies: { nb_login_challenge: challengeCookie! }, payload: { code: nextCode } });
    expect(completed.statusCode).toBe(200);
    const sessionCookie = completed.cookies.find((cookie) => cookie.name === "nb_session")?.value;
    expect(sessionCookie).toBeTruthy();

    const replayChallenge = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: OWNER_EMAIL, password: OWNER_PASSWORD } });
    const replayCookie = replayChallenge.cookies.find((cookie) => cookie.name === "nb_login_challenge")?.value;
    expect(replayChallenge.statusCode).toBe(202);
    const replayed = await app.inject({ method: "POST", url: "/api/auth/2fa", cookies: { nb_login_challenge: replayCookie! }, payload: { code: nextCode } });
    expect(replayed.statusCode).toBe(401);

    const recoveryCompleted = await app.inject({ method: "POST", url: "/api/auth/2fa", cookies: { nb_login_challenge: replayCookie! }, payload: { code: recoveryCode } });
    expect(recoveryCompleted.statusCode).toBe(200);
    const recoverySession = recoveryCompleted.cookies.find((cookie) => cookie.name === "nb_session")?.value;
    expect(recoverySession).toBeTruthy();

    const reusedChallenge = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: OWNER_EMAIL, password: OWNER_PASSWORD } });
    const reusedCookie = reusedChallenge.cookies.find((cookie) => cookie.name === "nb_login_challenge")?.value;
    const reusedRecovery = await app.inject({ method: "POST", url: "/api/auth/2fa", cookies: { nb_login_challenge: reusedCookie! }, payload: { code: recoveryCode } });
    expect(reusedRecovery.statusCode).toBe(401);

    const me = await app.inject({ method: "GET", url: "/api/auth/me", cookies: { nb_session: recoverySession! } });
    expect(me.statusCode).toBe(200);
  });
});
