import type { FastifyInstance } from "fastify";
import {
  buildApiError,
  TREND_METRICS,
  TREND_RANGES,
  type ApiNodeDetailResponse,
  type ApiNodesResponse,
  type NodeMeta,
  type StatusNode,
  type TrendMetric,
  type TrendRange
} from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";
import { loadNodeRegistry } from "../config/nodeRegistry.js";
import { getStatus } from "../services/statusService.js";
import { getNodeTrend } from "../services/trendService.js";
import { createPrometheusClient } from "../services/prometheusClient.js";

function toNodeMeta(node: StatusNode): NodeMeta {
  return {
    id: node.id,
    name: node.name,
    provider: node.provider,
    group: node.group,
    region: node.region,
    location: node.location,
    displayOrder: node.displayOrder,
    tags: node.tags,
    online: node.online,
    status: node.status,
    updatedAt: node.updatedAt
  };
}

export async function registerNodeRoutes(app: FastifyInstance, env: ApiEnv): Promise<void> {
  // Public: metadata + health of publicly visible nodes. No Prometheus labels.
  app.get("/api/nodes", async (request, reply): Promise<ApiNodesResponse | void> => {
    try {
      const status = await getStatus(env, request.log);
      return {
        generatedAt: status.generatedAt,
        nodes: status.nodes.filter((node) => node.public).map(toNodeMeta)
      };
    } catch (error) {
      request.log.error({ error }, "failed to build node list");
      return reply
        .code(503)
        .send(buildApiError("nodes_unavailable", "Node data is temporarily unavailable."));
    }
  });

  // Authenticated: full detail (including hidden nodes and label mapping).
  app.get<{ Params: { id: string } }>(
    "/api/nodes/:id",
    { preHandler: app.requireAuth },
    async (request, reply): Promise<ApiNodeDetailResponse | void> => {
      try {
        const status = await getStatus(env, request.log);
        const node = status.nodes.find((candidate) => candidate.id === request.params.id);
        if (!node) {
          return reply.code(404).send(buildApiError("node_not_found", "Unknown node id."));
        }
        return { generatedAt: status.generatedAt, node };
      } catch (error) {
        request.log.error({ error }, "failed to build node detail");
        return reply
          .code(503)
          .send(buildApiError("nodes_unavailable", "Node data is temporarily unavailable."));
      }
    }
  );

  // Authenticated: trend data via query_range. metric/range are strict enums.
  app.get<{ Params: { id: string }; Querystring: { metric?: string; range?: string } }>(
    "/api/nodes/:id/range",
    { preHandler: app.requireAuth },
    async (request, reply) => {
      const { metric, range } = request.query;
      if (!metric || !(TREND_METRICS as readonly string[]).includes(metric)) {
        return reply.code(400).send(
          buildApiError("invalid_metric", `metric must be one of: ${TREND_METRICS.join(", ")}.`)
        );
      }
      if (!range || !(TREND_RANGES as readonly string[]).includes(range)) {
        return reply.code(400).send(
          buildApiError("invalid_range", `range must be one of: ${TREND_RANGES.join(", ")}.`)
        );
      }

      const client = createPrometheusClient(env);
      if (!client) {
        return reply.code(503).send(
          buildApiError("trends_unavailable", "Trend data requires a configured Prometheus.")
        );
      }

      const registry = await loadNodeRegistry(env.nodeConfigPath);
      const node = registry.find((candidate) => candidate.id === request.params.id);
      if (!node) {
        return reply.code(404).send(buildApiError("node_not_found", "Unknown node id."));
      }

      try {
        return await getNodeTrend(client, node, metric as TrendMetric, range as TrendRange);
      } catch (error) {
        request.log.error({ error, nodeId: node.id, metric, range }, "trend query failed");
        return reply
          .code(503)
          .send(buildApiError("trends_unavailable", "Trend data is temporarily unavailable."));
      }
    }
  );
}
