import type { FastifyInstance } from "fastify";
import { metricsRegistry } from "../observability/metrics.js";

/**
 * NodeBeacon's own Prometheus metrics. Meant for the in-cluster scraper;
 * the public nginx entry blocks /metrics from the internet.
 */
export async function registerMetricsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/metrics", async (_request, reply) => {
    reply.header("content-type", metricsRegistry.contentType);
    return metricsRegistry.metrics();
  });
}
