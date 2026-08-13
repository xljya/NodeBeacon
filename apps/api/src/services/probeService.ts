import type { AdminProbeResult, AdminProbeResultsResponse, ApiLatencyResponse, ProbeResult } from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";
import { createPrometheusClient, type PrometheusVectorResult } from "./prometheusClient.js";
import { metric } from "./metricsService.js";
import { recordCacheEvent } from "../observability/metrics.js";
import { MANAGED_PROBE_JOBS } from "./managedProbes.js";

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

interface CachedAdminLatency {
  key: string;
  expiresAt: number;
  value: AdminProbeResultsResponse;
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

let cachedAdminLatency: CachedAdminLatency | null = null;

function adminCacheKey(env: ApiEnv, jobs: string[]): string {
  return [env.prometheusUrl ?? "none", jobs.join(","), env.statusCacheTtlSeconds].join("|");
}

function adminProbeJobs(env: ApiEnv): string[] {
  return [...new Set([env.probeJob, ...MANAGED_PROBE_JOBS].filter(Boolean))];
}

function byJobInstance(results: PrometheusVectorResult[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const result of results) {
    const instance = result.metric.instance;
    const job = result.metric.job ?? "";
    if (!instance) continue;
    const value = Number(result.value[1]);
    if (Number.isFinite(value)) map.set(`${job}\0${instance}`, value);
  }
  return map;
}

function emptyAdminResponse(env: ApiEnv, now: string, stale: boolean): AdminProbeResultsResponse {
  return {
    generatedAt: now,
    cache: { ttlSeconds: env.statusCacheTtlSeconds, stale },
    probes: []
  };
}

export async function getAdminProbeResults(env: ApiEnv, logger?: ProbeServiceLogger): Promise<AdminProbeResultsResponse> {
  const jobs = adminProbeJobs(env);
  const key = adminCacheKey(env, jobs);
  const nowMs = Date.now();
  if (cachedAdminLatency && cachedAdminLatency.key === key && cachedAdminLatency.expiresAt > nowMs) {
    recordCacheEvent("probe", "hit");
    return cachedAdminLatency.value;
  }
  recordCacheEvent("probe", "miss");

  const now = new Date(nowMs).toISOString();
  const client = createPrometheusClient(env);
  if (!client || !jobs.length) {
    return emptyAdminResponse(env, now, false);
  }

  const jobMatcher = [{ name: "job", operator: "=~" as const, value: jobs.join("|") }];
  try {
    const [success, duration, httpStatus, rate24h, sslExpiry] = await Promise.all([
      client.query(metric("probe_success", {}, jobMatcher)),
      client.query(metric("probe_duration_seconds", {}, jobMatcher)),
      client.query(metric("probe_http_status_code", {}, jobMatcher)),
      client.query(`avg_over_time(${metric("probe_success", {}, jobMatcher)}[24h])`),
      client.query(metric("probe_ssl_earliest_cert_expiry", {}, jobMatcher))
    ]);

    const successBy = byJobInstance(success);
    const durationBy = byJobInstance(duration);
    const statusBy = byJobInstance(httpStatus);
    const rateBy = byJobInstance(rate24h);
    const sslBy = byJobInstance(sslExpiry);

    const probes: AdminProbeResult[] = [...successBy.entries()]
      .map(([keyName, up]): AdminProbeResult => {
        const separator = keyName.indexOf("\0");
        const job = separator === -1 ? "" : keyName.slice(0, separator);
        const target = separator === -1 ? keyName : keyName.slice(separator + 1);
        const ssl = sslBy.get(keyName);
        return {
          job,
          target,
          success: up > 0,
          latencySeconds: durationBy.get(keyName) ?? null,
          httpStatusCode: statusBy.get(keyName) ?? null,
          successRate24h: rateBy.get(keyName) ?? null,
          sslExpiresAt: ssl !== undefined ? new Date(ssl * 1000).toISOString() : null
        };
      })
      .sort((a, b) => a.job.localeCompare(b.job) || a.target.localeCompare(b.target));

    const value: AdminProbeResultsResponse = {
      generatedAt: now,
      cache: { ttlSeconds: env.statusCacheTtlSeconds, stale: false },
      probes
    };
    cachedAdminLatency = {
      key,
      value,
      expiresAt: nowMs + Math.max(1, env.statusCacheTtlSeconds) * 1000
    };
    return value;
  } catch (error) {
    logger?.warn({ error }, "failed to refresh admin probe results; returning stale cache or empty");
    if (cachedAdminLatency && cachedAdminLatency.key === key) {
      recordCacheEvent("probe", "stale");
      return {
        ...cachedAdminLatency.value,
        cache: { ...cachedAdminLatency.value.cache, stale: true }
      };
    }
    return emptyAdminResponse(env, now, true);
  }
}
