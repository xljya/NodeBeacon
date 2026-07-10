import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { buildApiError, type AuthUser } from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";
import type { AuthService } from "../services/authService.js";
import type { SessionService } from "../services/sessionService.js";

const SESSION_COOKIE = "nb_session";

declare module "fastify" {
  interface FastifyRequest {
    /** Populated from the signed session cookie on every request (or undefined). */
    user?: AuthUser;
    /** Opaque persisted session id, when the request has an active session. */
    sessionId?: string;
  }
  interface FastifyInstance {
    requireAuth: preHandlerHookHandler;
    requireOwner: preHandlerHookHandler;
    setSession(reply: FastifyReply, user: AuthUser): void;
    clearSession(reply: FastifyReply): void;
  }
}

function readUser(
  request: FastifyRequest,
  authService: AuthService,
  sessionService: SessionService
): AuthUser | undefined {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return undefined;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return undefined;
  const session = sessionService.resolve(unsigned.value);
  if (!session) return undefined;
  // Resolve against the current owner so a stale/renamed owner cookie is rejected.
  const user = authService.getUserById(session.userId);
  if (!user) return undefined;
  request.sessionId = session.id;
  return user;
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Defense-in-depth CSRF backstop. The classic attack path is already blocked
 * (SameSite=Lax cookie, CORS pinned to WEB_ORIGIN, JSON-only body parsing);
 * this rejects any mutating request that carries a session but arrives with a
 * mismatched Origin. Same-origin requests without an Origin header pass.
 */
function originAllowed(request: FastifyRequest, webOrigin: string): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  if (origin === webOrigin) return true;
  try {
    // Accept true same-origin calls (e.g. dev via the Vite proxy on another
    // host/port): the Origin host must match the Host header we were hit on.
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

/**
 * Registers session helpers and the owner-only guard. @fastify/cookie MUST be
 * registered before this so request.cookies / unsignCookie are available.
 */
export function registerAuthGuard(
  app: FastifyInstance,
  env: ApiEnv,
  authService: AuthService,
  sessionService: SessionService
): void {
  app.addHook("onRequest", async (request, reply) => {
    request.user = readUser(request, authService, sessionService);
    if (SAFE_METHODS.has(request.method) || !request.user) return;
    if (!originAllowed(request, env.webOrigin)) {
      request.log.warn({ origin: request.headers.origin }, "rejected cross-origin mutating request");
      return reply.code(403).send(buildApiError("origin_mismatch", "Cross-origin request rejected."));
    }
  });

  app.decorate("setSession", function setSession(reply: FastifyReply, user: AuthUser): void {
    const sessionId = sessionService.create(user, env.sessionTtlSeconds, {
      ipAddress: reply.request.ip,
      userAgent: reply.request.headers["user-agent"]
    });
    reply.setCookie(SESSION_COOKIE, sessionId, {
      signed: true,
      httpOnly: true,
      sameSite: "lax",
      secure: env.secureCookie,
      path: "/",
      maxAge: env.sessionTtlSeconds
    });
  });

  app.decorate("clearSession", function clearSession(reply: FastifyReply): void {
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
  });

  app.decorate("requireAuth", function requireAuth(request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void): void {
    if (!request.user) {
      reply.code(401).send(buildApiError("unauthorized", "Authentication required."));
      return;
    }
    done();
  });

  app.decorate("requireOwner", function requireOwner(request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void): void {
    if (!request.user) {
      reply.code(401).send(buildApiError("unauthorized", "Authentication required."));
      return;
    }
    if (request.user.role !== "owner") {
      reply.code(403).send(buildApiError("forbidden", "Owner role required."));
      return;
    }
    done();
  });
}
