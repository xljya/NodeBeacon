import type { FastifyInstance } from "fastify";
import {
  buildApiError,
  DETAIL_AGGREGATIONS,
  DETAIL_CHART_METRICS,
  TREND_METRICS,
  TREND_RANGES,
  type ApiNodeDetailResponse,
  type DetailAggregation,
  type DetailChartMetric,
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
import { calculateDetailRange, getNodeDetail, getNodeDetailSeries } from "../services/nodeDetailService.js";

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

  // Public V2 detail data. This is intentionally separate from the existing
  // authenticated routes so the serializer and visibility boundary are clear.
  app.get<{ Params: { id: string } }>(
    "/api/public/nodes/:id/detail",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      try {
        const registry = await loadNodeRegistry(env.nodeConfigPath, env.nodeConfigSeedPath, request.log);
        const configNode = registry.find((candidate) => candidate.id === request.params.id);
        if (!configNode || !configNode.public || configNode.detail?.enabled === false || configNode.detail?.visibility === "authenticated") {
          return reply.code(404).send(buildApiError("node_not_found", "Unknown public node id."));
        }
        const status = await getStatus(env, request.log);
        const statusNode = status.nodes.find((candidate) => candidate.id === configNode.id);
        const client = createPrometheusClient(env);
        return await getNodeDetail(client, configNode, statusNode, status.generatedAt);
      } catch (error) {
        request.log.error({ error, nodeId: request.params.id }, "failed to build public node detail");
        return reply.code(503).send(buildApiError("node_detail_unavailable", "Node detail is temporarily unavailable."));
      }
    }
  );

  app.get<{
    Params: { id: string };
    Querystring: { metrics?: string; range?: string; from?: string; to?: string; aggregation?: string };
  }>(
    "/api/public/nodes/:id/series",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const aggregation = request.query.aggregation ?? "avg";
      if (!(DETAIL_AGGREGATIONS as readonly string[]).includes(aggregation)) {
        return reply.code(400).send(buildApiError("invalid_aggregation", "aggregation must be avg, max, or p95."));
      }
      const metricNames = (request.query.metrics ?? "cpu,memory,swap,disk,network")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const uniqueMetrics = [...new Set(metricNames)];
      if (!uniqueMetrics.length || uniqueMetrics.length > 8 || uniqueMetrics.some(
        (value) => !(DETAIL_CHART_METRICS as readonly string[]).includes(value)
      )) {
        return reply.code(400).send(buildApiError("invalid_metrics", `metrics must be up to 8 of: ${DETAIL_CHART_METRICS.join(", ")}.`));
      }

      const range = calculateDetailRange(request.query.range ?? "1d", request.query.from, request.query.to);
      if (!range) {
        return reply.code(400).send(buildApiError("invalid_range", "range or a valid from/to custom range is required."));
      }

      try {
        const registry = await loadNodeRegistry(env.nodeConfigPath, env.nodeConfigSeedPath, request.log);
        const configNode = registry.find((candidate) => candidate.id === request.params.id);
        if (!configNode || !configNode.public || configNode.detail?.enabled === false || configNode.detail?.visibility === "authenticated") {
          return reply.code(404).send(buildApiError("node_not_found", "Unknown public node id."));
        }
        const client = createPrometheusClient(env);
        if (!client) {
          return reply.code(503).send(buildApiError("trends_unavailable", "Trend data requires a configured Prometheus."));
        }
        return await getNodeDetailSeries(
          client,
          configNode,
          uniqueMetrics as DetailChartMetric[],
          range,
          aggregation as DetailAggregation
        );
      } catch (error) {
        request.log.error({ error, nodeId: request.params.id }, "failed to query public node detail series");
        return reply.code(503).send(buildApiError("trends_unavailable", "Trend data is temporarily unavailable."));
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

      const registry = await loadNodeRegistry(env.nodeConfigPath, env.nodeConfigSeedPath, request.log);
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
