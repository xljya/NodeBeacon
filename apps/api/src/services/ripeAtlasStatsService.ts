import type { ApiNodeLatencyStatsResponse } from "@nodebeacon/shared";
import type { RipeAtlasConfig } from "./ripeAtlasCollector.js";

const RIPE_ATLAS_API = "https://atlas.ripe.net/api/v2";
const STATS_WINDOW_SECONDS = 24 * 60 * 60;
const CACHE_TTL_MS = 5 * 60 * 1000;

interface RipeAtlasPacketResult {
  rtt?: number;
}

interface RipeAtlasRawPingResult {
  avg?: number;
  max?: number;
  min?: number;
  prb_id?: number;
  rcvd?: number;
  result?: RipeAtlasPacketResult[];
  sent?: number;
  timestamp?: number;
  type?: string;
}

interface CachedStats {
  expiresAt: number;
  value: ApiNodeLatencyStatsResponse;
}

const statsCache = new Map<string, CachedStats>();

function finiteNonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function quantile(values: number[], percentile: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lower === undefined || upper === undefined) return null;
  return lower + (upper - lower) * (position - lowerIndex);
}

function standardDeviation(values: number[]): number | null {
  const average = mean(values);
  if (average === null) return null;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

function resultAverage(result: RipeAtlasRawPingResult): number | null {
  const average = finiteNonNegative(result.avg);
  if (average !== null) return average;
  return mean((result.result ?? [])
    .map((packet) => finiteNonNegative(packet.rtt))
    .filter((value): value is number => value !== null));
}

export function calculateRipeAtlasLatencyStats(
  config: RipeAtlasConfig,
  nodeId: string,
  vantage: string,
  rawResults: RipeAtlasRawPingResult[],
  nowSeconds: number
): ApiNodeLatencyStatsResponse | null {
  const measurement = config.measurements.find((candidate) => candidate.nodeId === nodeId);
  const probe = config.probes.find((candidate) => candidate.key === vantage);
  if (!measurement || !probe) return null;

  const startSeconds = nowSeconds - STATS_WINDOW_SECONDS;
  const results = rawResults
    .filter((result) => result.type === "ping"
      && result.prb_id === probe.id
      && typeof result.timestamp === "number"
      && result.timestamp >= startSeconds
      && result.timestamp <= nowSeconds)
    .sort((left, right) => (left.timestamp ?? 0) - (right.timestamp ?? 0));
  const packetRtts = results.flatMap((result) => (result.result ?? [])
    .map((packet) => finiteNonNegative(packet.rtt))
    .filter((value): value is number => value !== null));
  const successfulAverages = results
    .map((result) => ({ timestamp: result.timestamp ?? 0, value: resultAverage(result) }))
    .filter((item): item is { timestamp: number; value: number } => item.value !== null);
  const jitterDeltas = successfulAverages.slice(1).map((item, index) => (
    Math.abs(item.value - (successfulAverages[index]?.value ?? item.value))
  ));
  const packetsSent = results.reduce((sum, result) => sum + (finiteNonNegative(result.sent) ?? 0), 0);
  const packetsReceived = results.reduce((sum, result) => sum + (finiteNonNegative(result.rcvd) ?? 0), 0);
  const timestamps = results.map((result) => result.timestamp ?? 0).filter((timestamp) => timestamp > 0);
  const latest = successfulAverages.at(-1);

  return {
    nodeId,
    vantage,
    vantageName: probe.label,
    source: {
      provider: probe.provider,
      probeId: probe.id,
      asn: `AS${probe.asn}`,
      city: probe.city,
      measurementId: measurement.measurementId
    },
    windowSeconds: STATS_WINDOW_SECONDS,
    intervalSeconds: config.intervalSeconds,
    type: "ICMP",
    measuredFrom: timestamps.length ? new Date(Math.min(...timestamps) * 1000).toISOString() : null,
    measuredTo: timestamps.length ? new Date(Math.max(...timestamps) * 1000).toISOString() : null,
    updatedAt: latest ? new Date(latest.timestamp * 1000).toISOString() : null,
    packetLossPercent: packetsSent > 0 ? Math.max(0, (1 - packetsReceived / packetsSent) * 100) : null,
    minimumMs: packetRtts.length ? Math.min(...packetRtts) : null,
    maximumMs: packetRtts.length ? Math.max(...packetRtts) : null,
    averageMs: mean(packetRtts),
    latestMs: latest?.value ?? null,
    p50Ms: quantile(packetRtts, 0.5),
    p99Ms: quantile(packetRtts, 0.99),
    standardDeviationMs: standardDeviation(packetRtts),
    jitterMs: mean(jitterDeltas),
    sampleCount: results.length,
    validSampleCount: successfulAverages.length,
    packetsSent,
    packetsReceived
  };
}

export async function getRipeAtlasLatencyStats(
  config: RipeAtlasConfig,
  nodeId: string,
  vantage: string,
  options: {
    fetchImpl?: typeof fetch;
    nowSeconds?: number;
    timeoutMs?: number;
  } = {}
): Promise<ApiNodeLatencyStatsResponse | null> {
  const measurement = config.measurements.find((candidate) => candidate.nodeId === nodeId);
  const probe = config.probes.find((candidate) => candidate.key === vantage);
  if (!measurement || !probe) return null;

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const cacheKey = `${nodeId}|${vantage}`;
  const cached = statsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  timeout.unref();
  try {
    const url = new URL(`${RIPE_ATLAS_API}/measurements/${measurement.measurementId}/results/`);
    url.searchParams.set("probe_ids", String(probe.id));
    url.searchParams.set("start", String(nowSeconds - STATS_WINDOW_SECONDS));
    url.searchParams.set("stop", String(nowSeconds));
    const response = await (options.fetchImpl ?? fetch)(url, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`RIPE Atlas results returned HTTP ${response.status}.`);
    const raw = await response.json() as unknown;
    if (!Array.isArray(raw)) throw new Error("RIPE Atlas results returned an unexpected payload.");
    const value = calculateRipeAtlasLatencyStats(
      config,
      nodeId,
      vantage,
      raw as RipeAtlasRawPingResult[],
      nowSeconds
    );
    if (value) {
      statsCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value });
      if (statsCache.size > 100) statsCache.clear();
    }
    return value;
  } finally {
    clearTimeout(timeout);
  }
}

export function clearRipeAtlasStatsCache(): void {
  statsCache.clear();
}
