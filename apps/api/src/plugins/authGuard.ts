import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { buildApiError, type AuthUser, type UserRole } from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";
import type { AuthService } from "../services/authService.js";

const SESSION_COOKIE = "nb_session";

interface SessionPayload {
  sub: string;
  role: UserRole;
  exp: number; // epoch seconds
}

declare module "fastify" {
  interface FastifyRequest {
    /** Populated from the signed session cookie on every request (or undefined). */
    user?: AuthUser;
  }
  interface FastifyInstance {
    requireAuth: preHandlerHookHandler;
    requireOwner: preHandlerHookHandler;
    setSession(reply: FastifyReply, user: AuthUser): void;
    clearSession(reply: FastifyReply): void;
  }
}

function encode(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decode(raw: string): SessionPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as SessionPayload;
    if (typeof parsed.sub === "string" && typeof parsed.exp === "number" && typeof parsed.role === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function readUser(request: FastifyRequest, authService: AuthService): AuthUser | undefined {
  const raw = request.cookies[SESSION_COOKIE];
  if (!raw) return undefined;
  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return undefined;
  const payload = decode(unsigned.value);
  if (!payload) return undefined;
  if (payload.exp * 1000 <= Date.now()) return undefined;
  // Resolve against the current owner so a stale/renamed owner cookie is rejected.
  const user = authService.getUserById(payload.sub);
  if (!user || user.role !== payload.role) return undefined;
  return user;
}

/**
 * Registers session helpers and the owner-only guard. @fastify/cookie MUST be
 * registered before this so request.cookies / unsignCookie are available.
 */
export function registerAuthGuard(app: FastifyInstance, env: ApiEnv, authService: AuthService): void {
  app.addHook("onRequest", async (request) => {
    request.user = readUser(request, authService);
  });

  app.decorate("setSession", function setSession(reply: FastifyReply, user: AuthUser): void {
    const exp = Math.floor(Date.now() / 1000) + env.sessionTtlSeconds;
    reply.setCookie(SESSION_COOKIE, encode({ sub: user.id, role: user.role, exp }), {
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
