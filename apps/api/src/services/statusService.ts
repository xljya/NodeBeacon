import {
  buildSummary,
  statusFixture,
  type ApiStatusResponse,
  type NodeConfigEntry,
  type StatusNode
} from "@nodebeacon/shared";
import { loadNodeRegistry } from "../config/nodeRegistry.js";
import type { ApiEnv } from "../config/env.js";
import { buildStatusFromPrometheus } from "./metricsService.js";
import { createPrometheusClient } from "./prometheusClient.js";

const fixtureById = new Map(statusFixture.nodes.map((node) => [node.id, node]));
const fallbackOsById = new Map(statusFixture.nodes.map((node) => [node.id, node.os]));

interface CachedStatus {
  key: string;
  expiresAt: number;
  value: ApiStatusResponse;
}

interface StatusServiceLogger {
  warn(payload: unknown, message?: string): void;
}

let cachedStatus: CachedStatus | null = null;

function cacheKey(env: ApiEnv): string {
  return [
    env.nodeConfigPath ?? "default-config",
    env.prometheusUrl ?? "fixture",
    env.statusCacheTtlSeconds
  ].join("|");
}

function withRegistryMetadata(node: NodeConfigEntry, fallbackIndex: number, now: string): StatusNode {
  const fixture = fixtureById.get(node.id) ?? statusFixture.nodes[fallbackIndex % statusFixture.nodes.length];
  if (!fixture) {
    throw new Error("Status fixture is empty.");
  }

  return {
    ...fixture,
    id: node.id,
    name: node.name,
    provider: node.provider,
    group: node.group,
    region: node.region,
    location: node.location,
    displayOrder: node.displayOrder,
    public: node.public,
    labels: node.labels,
    tags: node.tags,
    updatedAt: now
  };
}

function buildFallbackStatus(
  env: ApiEnv,
  registry: NodeConfigEntry[],
  now: string,
  stale: boolean
): ApiStatusResponse {
  const nodes = registry.map((node, index) => withRegistryMetadata(node, index, now));

  return {
    generatedAt: now,
    cache: {
      ttlSeconds: env.statusCacheTtlSeconds,
      stale
    },
    summary: buildSummary(nodes),
    nodes
  };
}

function withStaleCache(value: ApiStatusResponse): ApiStatusResponse {
  return {
    ...value,
    cache: {
      ...value.cache,
      stale: true
    }
  };
}

export async function getStatus(env: ApiEnv, logger?: StatusServiceLogger): Promise<ApiStatusResponse> {
  const key = cacheKey(env);
  const nowMs = Date.now();
  if (cachedStatus && cachedStatus.key === key && cachedStatus.expiresAt > nowMs) {
    return cachedStatus.value;
  }

  const registry = await loadNodeRegistry(env.nodeConfigPath);
  const now = new Date(nowMs).toISOString();
  const client = createPrometheusClient(env);
  let response: ApiStatusResponse;

  if (client) {
    try {
      const result = await buildStatusFromPrometheus(client, registry, fallbackOsById, now);
      if (result.queryCount > 0 && result.failedQueryCount === result.queryCount) {
        throw new Error("All Prometheus status queries failed.");
      }
      if (result.failedQueryCount > 0) {
        logger?.warn(
          { failedQueryCount: result.failedQueryCount, queryCount: result.queryCount },
          "some Prometheus status queries failed; returning degraded node data"
        );
      }

      response = {
        generatedAt: now,
        cache: {
          ttlSeconds: env.statusCacheTtlSeconds,
          stale: false
        },
        summary: buildSummary(result.nodes),
        nodes: result.nodes
      };
    } catch (error) {
      logger?.warn(
        { error },
        "failed to refresh status from Prometheus; returning stale cache or fixture fallback"
      );
      if (cachedStatus && cachedStatus.key === key) {
        return withStaleCache(cachedStatus.value);
      }
      response = buildFallbackStatus(env, registry, now, true);
    }
  } else {
    response = buildFallbackStatus(env, registry, now, false);
  }

  cachedStatus = {
    key,
    value: response,
    expiresAt: nowMs + Math.max(1, env.statusCacheTtlSeconds) * 1000
  };

  return response;
}
