import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

/**
 * NodeBeacon's own observability (development-plan §11): request volume and
 * latency, Prometheus query duration/errors, and cache hit rate. Exposed as
 * Prometheus text at GET /metrics for the in-cluster scraper.
 */
export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

export const httpRequestsTotal = new Counter({
  name: "nodebeacon_http_requests_total",
  help: "HTTP requests handled, by method, route pattern and status code.",
  labelNames: ["method", "route", "status"] as const,
  registers: [metricsRegistry]
});

export const httpRequestDurationSeconds = new Histogram({
  name: "nodebeacon_http_request_duration_seconds",
  help: "HTTP request duration by method and route pattern.",
  labelNames: ["method", "route"] as const,
  buckets: [0.005, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry]
});

export const prometheusQueriesTotal = new Counter({
  name: "nodebeacon_prometheus_queries_total",
  help: "Upstream Prometheus API calls, by endpoint and outcome.",
  labelNames: ["endpoint", "outcome"] as const,
  registers: [metricsRegistry]
});

export const prometheusQueryDurationSeconds = new Histogram({
  name: "nodebeacon_prometheus_query_duration_seconds",
  help: "Upstream Prometheus API call duration, by endpoint.",
  labelNames: ["endpoint"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [metricsRegistry]
});

export const cacheEventsTotal = new Counter({
  name: "nodebeacon_cache_events_total",
  help: "Response-cache events (hit/miss/stale) by cache name.",
  labelNames: ["cache", "event"] as const,
  registers: [metricsRegistry]
});

export const alertmanagerWebhookRequestsTotal = new Counter({
  name: "nodebeacon_alertmanager_webhook_requests_total",
  help: "Alertmanager webhook requests handled, by outcome.",
  labelNames: ["outcome"] as const,
  registers: [metricsRegistry]
});

export const alertmanagerReadsTotal = new Counter({
  name: "nodebeacon_alertmanager_reads_total",
  help: "Upstream Alertmanager API reads, by outcome.",
  labelNames: ["outcome"] as const,
  registers: [metricsRegistry]
});

export const alertmanagerReadDurationSeconds = new Histogram({
  name: "nodebeacon_alertmanager_read_duration_seconds",
  help: "Upstream Alertmanager API read duration.",
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [metricsRegistry]
});

export type CacheName = "status" | "trend" | "probe";

export function recordCacheEvent(cache: CacheName, event: "hit" | "miss" | "stale"): void {
  cacheEventsTotal.inc({ cache, event });
}
