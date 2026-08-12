import {
  buildSummary,
  statusFixture,
  type ApiStatusResponse,
  type NodeConfigEntry,
  type PublicStatusNode,
  type StatusNode
} from "@nodebeacon/shared";
import { loadNodeRegistry } from "../config/nodeRegistry.js";
import type { ApiEnv } from "../config/env.js";
import { buildStatusFromPrometheus } from "./metricsService.js";
import { createPrometheusClient } from "./prometheusClient.js";
import { recordCacheEvent } from "../observability/metrics.js";

const fixtureById = new Map(statusFixture.nodes.map((node) => [node.id, node]));
const fallbackOsById = new Map(statusFixture.nodes.map((node) => [node.id, node.os]));

interface CachedStatus {
  key: string;
  expiresAt: number;
  value: StatusSnapshot;
}

interface StatusSnapshot extends Omit<ApiStatusResponse, "nodes"> {
  nodes: StatusNode[];
}

interface StatusServiceLogger {
  warn(payload: unknown, message?: string): void;
  error(payload: unknown, message?: string): void;
}

let cachedStatus: CachedStatus | null = null;
const prometheusReachability = new Map<string, boolean>();

const UNKNOWN_METRICS: StatusNode["metrics"] = {
  cpuPercent: 0,
  memoryPercent: 0,
  memoryUsedBytes: 0,
  memoryTotalBytes: 0,
  diskPercent: 0,
  diskUsedBytes: 0,
  diskTotalBytes: 0,
  load1: 0,
  uptimeSeconds: 0,
  networkRxBytesPerSecond: 0,
  networkTxBytesPerSecond: 0,
  networkRxBytesTotal: 0,
  networkTxBytesTotal: 0
};

function cacheKey(env: ApiEnv): string {
  return [
    env.nodeConfigPath ?? "default-config",
    env.prometheusUrl ?? "fixture",
    env.statusCacheTtlSeconds
  ].join("|");
}

function withRegistryMetadata(
  node: NodeConfigEntry,
  fallbackIndex: number,
  now: string,
  unknownMetrics: boolean
): StatusNode {
  const fixture = fixtureById.get(node.id) ?? statusFixture.nodes[fallbackIndex % statusFixture.nodes.length];
  if (!fixture) {
    throw new Error("Status fixture is empty.");
  }

  const result: StatusNode = {
    ...fixture,
    id: node.id,
    name: node.name,
    provider: node.provider,
    group: node.group,
    region: node.region,
    countryCode: node.countryCode,
    location: node.location,
    displayOrder: node.displayOrder,
    public: node.public,
    labels: node.labels,
    tags: node.tags,
    updatedAt: now
  };
  if (unknownMetrics) {
    result.online = false;
    result.status = "unknown";
    result.metrics = UNKNOWN_METRICS;
  }
  return result;
}

function buildFallbackStatus(
  env: ApiEnv,
  registry: NodeConfigEntry[],
  now: string,
  stale: boolean
): StatusSnapshot {
  // Fixtures are a local-development convenience only. If a real Prometheus
  // target is configured but unavailable at cold start, report unknown/zero
  // instead of presenting believable fake production metrics.
  const nodes = registry.map((node, index) => withRegistryMetadata(node, index, now, Boolean(env.prometheusUrl)));

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

function withStaleCache(value: StatusSnapshot): StatusSnapshot {
  return {
    ...value,
    cache: {
      ...value.cache,
      stale: true
    }
  };
}

export async function getStatus(env: ApiEnv, logger?: StatusServiceLogger): Promise<StatusSnapshot> {
  const key = cacheKey(env);
  const nowMs = Date.now();
  if (cachedStatus && cachedStatus.key === key && cachedStatus.expiresAt > nowMs) {
    recordCacheEvent("status", "hit");
    return cachedStatus.value;
  }
  recordCacheEvent("status", "miss");

  const registry = await loadNodeRegistry(env.nodeConfigPath, env.nodeConfigSeedPath, logger);
  const now = new Date(nowMs).toISOString();
  const client = createPrometheusClient(env);
  let response: StatusSnapshot;

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
      prometheusReachability.set(key, true);

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
      prometheusReachability.set(key, false);
      logger?.warn(
        { error },
        "failed to refresh status from Prometheus; returning stale cache or unknown node data"
      );
      if (cachedStatus && cachedStatus.key === key) {
        recordCacheEvent("status", "stale");
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

export function toPublicStatusNode(node: StatusNode): PublicStatusNode {
  return {
    id: node.id,
    name: node.name,
    provider: node.provider,
    group: node.group,
    region: node.region,
    countryCode: node.countryCode,
    location: node.location,
    displayOrder: node.displayOrder,
    public: true,
    tags: [...node.tags],
    online: node.online,
    status: node.status,
    os: { ...node.os },
    metrics: { ...node.metrics },
    updatedAt: node.updatedAt
  };
}

export async function getPublicStatus(
  env: ApiEnv,
  logger?: StatusServiceLogger
): Promise<ApiStatusResponse> {
  const status = await getStatus(env, logger);
  const nodes = status.nodes
    .filter((node) => node.public)
    .map(toPublicStatusNode);

  return {
    generatedAt: status.generatedAt,
    cache: { ...status.cache },
    summary: buildSummary(nodes),
    nodes
  };
}

export function clearStatusCache(): void {
  cachedStatus = null;
  prometheusReachability.clear();
}

export function getPrometheusReachability(env: ApiEnv): boolean {
  if (!env.prometheusUrl) return false;
  return prometheusReachability.get(cacheKey(env)) ?? false;
}
