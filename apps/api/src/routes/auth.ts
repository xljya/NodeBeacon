import type { FastifyInstance } from "fastify";
import { buildApiError, type AuthResponse, type LoginRequest } from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";
import type { AuthService } from "../services/authService.js";

export async function registerAuthRoutes(
  app: FastifyInstance,
  env: ApiEnv,
  authService: AuthService
): Promise<void> {
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
      if (!authService.ownerConfigured) {
        request.log.warn("login attempted but no owner is configured (INITIAL_OWNER_* unset)");
        return reply.code(503).send(buildApiError("owner_not_configured", "No administrator account is configured."));
      }

      const user = await authService.verifyCredentials(email, password);
      if (!user) {
        return reply.code(401).send(buildApiError("invalid_credentials", "Invalid email or password."));
      }

      app.setSession(reply, user);
      const response: AuthResponse = { user };
      return reply.send(response);
    }
  );

  app.post("/api/auth/logout", async (_request, reply) => {
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
}
