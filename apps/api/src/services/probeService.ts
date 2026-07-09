import type { ApiLatencyResponse, ProbeResult } from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";
import { createPrometheusClient, type PrometheusVectorResult } from "./prometheusClient.js";
import { metric } from "./metricsService.js";
import { recordCacheEvent } from "../observability/metrics.js";

/**
 * Public blackbox probe summary (/api/latency). Targets are discovered from
 * Prometheus by the configured probe job label — the browser never supplies
 * queries or target names.
 */

interface CachedLatency {
  key: string;
  expiresAt: number;
  value: ApiLatencyResponse;
}

interface ProbeServiceLogger {
  warn(payload: unknown, message?: string): void;
}

let cachedLatency: CachedLatency | null = null;

function cacheKey(env: ApiEnv): string {
  return [env.prometheusUrl ?? "none", env.probeJob, env.statusCacheTtlSeconds].join("|");
}

function byInstance(results: PrometheusVectorResult[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const result of results) {
    const instance = result.metric.instance;
    if (!instance) continue;
    const value = Number(result.value[1]);
    if (Number.isFinite(value)) map.set(instance, value);
  }
  return map;
}

function emptyResponse(env: ApiEnv, now: string, stale: boolean): ApiLatencyResponse {
  return {
    generatedAt: now,
    cache: { ttlSeconds: env.statusCacheTtlSeconds, stale },
    probes: []
  };
}

export async function getLatency(env: ApiEnv, logger?: ProbeServiceLogger): Promise<ApiLatencyResponse> {
  const key = cacheKey(env);
  const nowMs = Date.now();
  if (cachedLatency && cachedLatency.key === key && cachedLatency.expiresAt > nowMs) {
    recordCacheEvent("probe", "hit");
    return cachedLatency.value;
  }
  recordCacheEvent("probe", "miss");

  const now = new Date(nowMs).toISOString();
  const client = createPrometheusClient(env);
  if (!client || !env.probeJob) {
    return emptyResponse(env, now, false);
  }

  const labels = { job: env.probeJob };
  try {
    const [success, duration, httpStatus, rate24h, sslExpiry] = await Promise.all([
      client.query(metric("probe_success", labels)),
      client.query(metric("probe_duration_seconds", labels)),
      client.query(metric("probe_http_status_code", labels)),
      client.query(`avg_over_time(${metric("probe_success", labels)}[24h])`),
      client.query(metric("probe_ssl_earliest_cert_expiry", labels))
    ]);

    const successBy = byInstance(success);
    const durationBy = byInstance(duration);
    const statusBy = byInstance(httpStatus);
    const rateBy = byInstance(rate24h);
    const sslBy = byInstance(sslExpiry);

    const probes: ProbeResult[] = [...successBy.entries()]
      .map(([target, up]): ProbeResult => {
        const ssl = sslBy.get(target);
        return {
          target,
          success: up > 0,
          latencySeconds: durationBy.get(target) ?? null,
          httpStatusCode: statusBy.get(target) ?? null,
          successRate24h: rateBy.get(target) ?? null,
          sslExpiresAt: ssl !== undefined ? new Date(ssl * 1000).toISOString() : null
        };
      })
      .sort((a, b) => a.target.localeCompare(b.target));

    const value: ApiLatencyResponse = {
      generatedAt: now,
      cache: { ttlSeconds: env.statusCacheTtlSeconds, stale: false },
      probes
    };
    cachedLatency = {
      key,
      value,
      expiresAt: nowMs + Math.max(1, env.statusCacheTtlSeconds) * 1000
    };
    return value;
  } catch (error) {
    logger?.warn({ error }, "failed to refresh probe latency; returning stale cache or empty");
    if (cachedLatency && cachedLatency.key === key) {
      recordCacheEvent("probe", "stale");
      return {
        ...cachedLatency.value,
        cache: { ...cachedLatency.value.cache, stale: true }
      };
    }
    return emptyResponse(env, now, true);
  }
}
