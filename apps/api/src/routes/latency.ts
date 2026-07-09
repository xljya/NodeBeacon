import type { FastifyInstance } from "fastify";
import { buildApiError } from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";
import { getLatency } from "../services/probeService.js";

export async function registerLatencyRoutes(app: FastifyInstance, env: ApiEnv): Promise<void> {
  // Public: blackbox HTTP probe summary (latency / success rate / status code).
  app.get("/api/latency", async (request, reply) => {
    try {
      return await getLatency(env, request.log);
    } catch (error) {
      request.log.error({ error }, "failed to build latency response");
      return reply
        .code(503)
        .send(buildApiError("latency_unavailable", "Probe data is temporarily unavailable."));
    }
  });
}
