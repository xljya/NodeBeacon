import type { FastifyInstance } from "fastify";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/healthz", async () => ({
    status: "ok",
    service: "nodebeacon-api"
  }));

  app.get("/readyz", async () => ({
    status: "ready",
    service: "nodebeacon-api"
  }));
}
