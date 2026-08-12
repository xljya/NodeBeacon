import type { FastifyInstance } from "fastify";
import { buildApiError } from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";
import { getPublicStatus } from "../services/statusService.js";

export async function registerStatusRoutes(app: FastifyInstance, env: ApiEnv): Promise<void> {
  app.get("/api/status", async (request, reply) => {
    try {
      return await getPublicStatus(env, request.log);
    } catch (error) {
      request.log.error({ error }, "failed to build status response");
      return reply
        .code(503)
        .send(buildApiError("status_unavailable", "Status data is temporarily unavailable."));
    }
  });
}
