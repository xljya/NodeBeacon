import type {
  ApiNodeRangeResponse,
  NodeConfigEntry,
  TrendMetric,
  TrendRange,
  TrendSeries,
  TrendUnit
} from "@nodebeacon/shared";
import type { PrometheusClient, PrometheusMatrixResult } from "./prometheusClient.js";
import {
  filesystemTypeExclude,
  metric,
  networkDeviceExclude,
  type LabelMatcher
} from "./metricsService.js";
import { recordCacheEvent } from "../observability/metrics.js";

/**
 * Each whitelisted range maps to a fixed resolution. `rateWindow` widens with
 * the step so rate() always spans several scrape intervals, and `cacheTtlMs`
 * grows with the range so long windows don't re-hit Prometheus on every view.
 */
const RANGE_PRESETS: Record<TrendRange, { seconds: number; stepSeconds: number; rateWindow: string; cacheTtlMs: number }> = {
  "1h": { seconds: 60 * 60, stepSeconds: 30, rateWindow: "2m", cacheTtlMs: 30_000 },
  "4h": { seconds: 4 * 60 * 60, stepSeconds: 120, rateWindow: "5m", cacheTtlMs: 60_000 },
  "24h": { seconds: 24 * 60 * 60, stepSeconds: 600, rateWindow: "15m", cacheTtlMs: 300_000 },
  "7d": { seconds: 7 * 24 * 60 * 60, stepSeconds: 3600, rateWindow: "2h", cacheTtlMs: 900_000 }
};

interface TrendQuerySpec {
  unit: TrendUnit;
  series: Array<{ name: string; query: string }>;
}

function buildTrendSpec(
  metricName: TrendMetric,
  labels: Record<string, string>,
  rateWindow: string
): TrendQuerySpec {
  const rootFsExtra: LabelMatcher[] = [
    { name: "mountpoint", operator: "=", value: "/" },
    { name: "fstype", operator: "!~", value: filesystemTypeExclude }
  ];
  const networkExtra: LabelMatcher[] = [
    { name: "device", operator: "!~", value: networkDeviceExclude }
  ];

  switch (metricName) {
    case "cpu": {
      const idle = metric("node_cpu_seconds_total", labels, [{ name: "mode", operator: "=", value: "idle" }]);
      return {
        unit: "percent",
        series: [{ name: "value", query: `100 * (1 - avg(rate(${idle}[${rateWindow}])))` }]
      };
    }
    case "memory":
      return {
        unit: "percent",
        series: [{
          name: "value",
          query: `100 * (1 - ${metric("node_memory_MemAvailable_bytes", labels)} / ${metric("node_memory_MemTotal_bytes", labels)})`
        }]
      };
    case "disk":
      return {
        unit: "percent",
        series: [{
          name: "value",
          query: `100 * (1 - max(${metric("node_filesystem_free_bytes", labels, rootFsExtra)}) / max(${metric("node_filesystem_size_bytes", labels, rootFsExtra)}))`
        }]
      };
    case "network":
      return {
        unit: "bytes_per_second",
        series: [
          { name: "rx", query: `sum(rate(${metric("node_network_receive_bytes_total", labels, networkExtra)}[${rateWindow}]))` },
          { name: "tx", query: `sum(rate(${metric("node_network_transmit_bytes_total", labels, networkExtra)}[${rateWindow}]))` }
        ]
      };
    case "load":
      return {
        unit: "load",
        series: [{ name: "value", query: metric("node_load1", labels) }]
      };
  }
}

function toPoints(results: PrometheusMatrixResult[]): Array<[number, number | null]> {
  const first = results[0];
  if (!first) return [];
  return first.values.map(([ts, raw]) => {
    const value = Number(raw);
    return [ts, Number.isFinite(value) ? value : null];
  });
}

interface CachedTrend {
  expiresAt: number;
  value: ApiNodeRangeResponse;
}

const trendCache = new Map<string, CachedTrend>();
const TREND_CACHE_MAX_ENTRIES = 500;

export async function getNodeTrend(
  client: PrometheusClient,
  node: NodeConfigEntry,
  metricName: TrendMetric,
  range: TrendRange
): Promise<ApiNodeRangeResponse> {
  const key = `${node.id}|${metricName}|${range}`;
  const nowMs = Date.now();
  const cached = trendCache.get(key);
  if (cached && cached.expiresAt > nowMs) {
    recordCacheEvent("trend", "hit");
    return cached.value;
  }
  recordCacheEvent("trend", "miss");

  const preset = RANGE_PRESETS[range];
  const spec = buildTrendSpec(metricName, node.labels, preset.rateWindow);
  const endSeconds = Math.floor(nowMs / 1000);
  const startSeconds = endSeconds - preset.seconds;

  const series: TrendSeries[] = await Promise.all(
    spec.series.map(async ({ name, query }) => ({
      name,
      points: toPoints(await client.queryRange(query, startSeconds, endSeconds, preset.stepSeconds))
    }))
  );

  const value: ApiNodeRangeResponse = {
    nodeId: node.id,
    metric: metricName,
    range,
    stepSeconds: preset.stepSeconds,
    unit: spec.unit,
    generatedAt: new Date(nowMs).toISOString(),
    series
  };

  if (trendCache.size >= TREND_CACHE_MAX_ENTRIES) {
    trendCache.clear();
  }
  trendCache.set(key, { expiresAt: nowMs + preset.cacheTtlMs, value });
  return value;
}
