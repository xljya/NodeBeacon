import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  buildApiError,
  type AuthConfigResponse,
  type AuthResponse,
  type LoginRequest,
  type SecondFactorRequiredResponse
} from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";
import type { AuthService } from "../services/authService.js";
import type { SessionService } from "../services/sessionService.js";
import type { AuditService } from "../services/auditService.js";
import { buildAuthorizeUrl, exchangeCodeForIdentity } from "../services/githubOAuth.js";
import type { AuthChallengeService } from "../services/authChallengeService.js";
import { AUTH_CHALLENGE_COOKIE, AUTH_CHALLENGE_TTL_SECONDS } from "../services/authChallengeService.js";

const OAUTH_STATE_COOKIE = "nb_oauth_state";

function setChallengeCookie(reply: FastifyReply, env: ApiEnv, token: string): void {
  reply.setCookie(AUTH_CHALLENGE_COOKIE, token, {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    secure: env.secureCookie,
    path: "/api/auth",
    maxAge: AUTH_CHALLENGE_TTL_SECONDS
  });
}

function clearChallengeCookie(reply: FastifyReply): void {
  reply.clearCookie(AUTH_CHALLENGE_COOKIE, { path: "/api/auth" });
}

function readChallengeToken(request: FastifyRequest): string | null {
  const raw = request.cookies[AUTH_CHALLENGE_COOKIE];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid && unsigned.value ? unsigned.value : null;
}

function computeRedirectUri(env: ApiEnv, request: FastifyRequest): string {
  if (env.githubCallbackUrl) return env.githubCallbackUrl;
  const forwardedProto = (request.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim();
  const proto = forwardedProto || request.protocol;
  const host = request.headers.host ?? "localhost";
  const base = env.publicBaseUrl ?? `${proto}://${host}`;
  return `${base.replace(/\/+$/, "")}/api/auth/github/callback`;
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  env: ApiEnv,
  authService: AuthService,
  sessionService: SessionService,
  auditService: AuditService,
  challengeService: AuthChallengeService
): Promise<void> {
  // Public: lets the login page decide which sign-in methods to show.
  app.get("/api/auth/config", async (): Promise<AuthConfigResponse> => ({
    passwordLoginEnabled: authService.passwordLoginEnabled,
    githubLoginEnabled: authService.githubLoginEnabled
  }));

  app.post(
    "/api/auth/login",
    // Only this route opts into rate limiting (plugin registered global:false).
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = request.body as Partial<LoginRequest> | undefined;
      const email = typeof body?.email === "string" ? body.email : "";
      const password = typeof body?.password === "string" ? body.password : "";

      if (!email || !password) {
        return reply.code(400).send(buildApiError("invalid_request", "email and password are required."));
      }
      if (!authService.passwordLoginEnabled) {
        return reply.code(503).send(buildApiError("owner_not_configured", "Password login is not configured."));
      }

      const user = await authService.verifyCredentials(email, password);
      if (!user) {
        return reply.code(401).send(buildApiError("invalid_credentials", "Invalid email or password."));
      }
      if (authService.totpEnabled) {
        const token = challengeService.create(user, "password");
        setChallengeCookie(reply, env, token);
        const response: SecondFactorRequiredResponse = { status: "second_factor_required", methods: ["totp", "recovery_code"] };
        return reply.code(202).send(response);
      }

      app.setSession(reply, user);
      auditService.record({ actor: user.id, action: "auth.login", payload: { method: "password" } });
      const response: AuthResponse = { user };
      return reply.send(response);
    }
  );

  app.get("/api/auth/challenge", async (request) => {
    const token = readChallengeToken(request);
    return { required: Boolean(token && challengeService.resolve(token)) };
  });

  app.post(
    "/api/auth/2fa",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const token = readChallengeToken(request);
      const challenge = token ? challengeService.resolve(token) : null;
      if (!token || !challenge) {
        clearChallengeCookie(reply);
        return reply.code(401).send(buildApiError("challenge_expired", "The sign-in challenge has expired. Start again."));
      }
      const body = request.body as { code?: unknown } | undefined;
      const code = typeof body?.code === "string" ? body.code : "";
      if (!authService.verifySecondFactor(code)) {
        const failure = challengeService.recordFailure(token);
        if (failure.expired) clearChallengeCookie(reply);
        return reply.code(401).send(buildApiError(failure.expired ? "challenge_expired" : "invalid_second_factor", failure.expired ? "The sign-in challenge has expired. Start again." : "Invalid authenticator or recovery code."));
      }
      challengeService.consume(token);
      clearChallengeCookie(reply);
      app.setSession(reply, challenge.user);
      auditService.record({ actor: challenge.user.id, action: "auth.login", payload: { method: challenge.method, secondFactor: "totp_or_recovery" } });
      const response: AuthResponse = { user: challenge.user };
      return reply.send(response);
    }
  );

  app.post("/api/auth/2fa/cancel", async (request, reply) => {
    const token = readChallengeToken(request);
    if (token) challengeService.consume(token);
    clearChallengeCookie(reply);
    return reply.send({ status: "ok" });
  });

  app.post("/api/auth/logout", async (request, reply) => {
    if (request.sessionId) {
      sessionService.revoke(request.sessionId);
      if (request.user) {
        auditService.record({ actor: request.user.id, action: "auth.logout" });
      }
    }
    app.clearSession(reply);
    return reply.send({ status: "ok" });
  });

  app.get("/api/auth/me", async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send(buildApiError("unauthorized", "Not authenticated."));
    }
    const response: AuthResponse = { user: request.user };
    return reply.send(response);
  });

  app.post("/api/auth/register", async (_request, reply) => {
    // Registration is closed: the owner is provisioned from the environment.
    return reply.code(403).send(buildApiError("registration_disabled", "Registration is disabled."));
  });

  // --- GitHub OAuth ---

  app.get("/api/auth/github", async (request, reply) => {
    if (!authService.githubLoginEnabled) {
      return reply.redirect("/login?error=github_disabled");
    }
    const state = randomBytes(16).toString("hex");
    reply.setCookie(OAUTH_STATE_COOKIE, state, {
      signed: true,
      httpOnly: true,
      sameSite: "lax",
      secure: env.secureCookie,
      path: "/",
      maxAge: 600
    });
    const redirectUri = computeRedirectUri(env, request);
    return reply.redirect(buildAuthorizeUrl(env, state, redirectUri));
  });

  app.get("/api/auth/github/callback", async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };

    const clearState = () => reply.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });

    if (!authService.githubLoginEnabled) {
      return reply.redirect("/login?error=github_disabled");
    }
    if (query.error || !query.code || !query.state) {
      clearState();
      return reply.redirect("/login?error=github_failed");
    }

    // CSRF: the state param must match the signed cookie we set.
    const rawState = request.cookies[OAUTH_STATE_COOKIE];
    const unsigned = rawState ? request.unsignCookie(rawState) : { valid: false, value: null };
    clearState();
    if (!unsigned.valid || !unsigned.value || unsigned.value !== query.state) {
      return reply.redirect("/login?error=github_failed");
    }

    try {
      const identity = await exchangeCodeForIdentity(env, query.code, computeRedirectUri(env, request));
      const owner = authService.resolveGithubOwner(identity.login, identity.email);
      if (!owner) {
        // Authenticated with GitHub, but not the bound owner account.
        request.log.warn({ login: identity.login }, "github login rejected: not the owner account");
        return reply.redirect("/login?error=github_unbound");
      }
      if (authService.totpEnabled) {
        const token = challengeService.create(owner, "github");
        setChallengeCookie(reply, env, token);
        return reply.redirect("/login?step=second-factor");
      }
      app.setSession(reply, owner);
      auditService.record({ actor: owner.id, action: "auth.login", payload: { method: "github" } });
      return reply.redirect("/admin");
    } catch (error) {
      request.log.error({ error }, "github oauth callback failed");
      return reply.redirect("/login?error=github_failed");
    }
  });
}
