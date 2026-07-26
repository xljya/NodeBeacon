import { readFileSync } from "node:fs";
import type { ApiEnv } from "../config/env.js";
import {
  ripeAtlasCollectionDurationSeconds,
  ripeAtlasCollectionRequestsTotal,
  ripeAtlasLastCollectionSuccessTimestampSeconds,
  ripeAtlasProbeSuccess,
  ripeAtlasResultTimestampSeconds,
  ripeAtlasRttMilliseconds
} from "../observability/metrics.js";

const RIPE_ATLAS_API = "https://atlas.ripe.net/api/v2";
const DEFAULT_POLL_INTERVAL_MS = 60_000;

export interface RipeAtlasProbeConfig {
  id: number;
  key: string;
  label: string;
  provider: string;
  asn: number;
  city: string;
}

export interface RipeAtlasMeasurementConfig {
  nodeId: string;
  measurementId: number;
}

export interface RipeAtlasConfig {
  version: 1;
  provider: "ripe-atlas";
  createdAt: string;
  intervalSeconds: number;
  probes: RipeAtlasProbeConfig[];
  measurements: RipeAtlasMeasurementConfig[];
}

interface RipeAtlasPingResult {
  avg?: number;
  prb_id?: number;
  rcvd?: number;
  sent?: number;
  timestamp?: number;
  type?: string;
}

type LatestResponse = Record<string, RipeAtlasPingResult[]> | RipeAtlasPingResult[];
type FetchLike = typeof fetch;

export interface RipeAtlasCollectorLogger {
  info: (context: unknown, message?: string) => void;
  warn: (context: unknown, message?: string) => void;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function boundedString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= maxLength ? trimmed : null;
}

export function parseRipeAtlasConfig(raw: unknown): RipeAtlasConfig {
  if (!raw || typeof raw !== "object") throw new Error("RIPE Atlas config must be an object.");
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 || value.provider !== "ripe-atlas") {
    throw new Error("Unsupported RIPE Atlas config version/provider.");
  }
  const intervalSeconds = positiveInteger(value.intervalSeconds);
  if (!intervalSeconds || intervalSeconds < 60) {
    throw new Error("RIPE Atlas intervalSeconds must be at least 60.");
  }
  if (!Array.isArray(value.probes) || value.probes.length < 1 || value.probes.length > 16) {
    throw new Error("RIPE Atlas config must contain 1 to 16 probes.");
  }
  if (!Array.isArray(value.measurements) || value.measurements.length < 1 || value.measurements.length > 32) {
    throw new Error("RIPE Atlas config must contain 1 to 32 measurements.");
  }

  const probeIds = new Set<number>();
  const probeKeys = new Set<string>();
  const probes = value.probes.map((candidate) => {
    if (!candidate || typeof candidate !== "object") throw new Error("Invalid RIPE Atlas probe entry.");
    const probe = candidate as Record<string, unknown>;
    const id = positiveInteger(probe.id);
    const key = boundedString(probe.key, 64);
    const label = boundedString(probe.label, 64);
    const provider = boundedString(probe.provider, 96);
    const asn = positiveInteger(probe.asn);
    const city = boundedString(probe.city, 96);
    if (!id || !key || !/^[a-z0-9_]+$/.test(key) || !label || !provider || !asn || !city) {
      throw new Error("Invalid RIPE Atlas probe fields.");
    }
    if (probeIds.has(id) || probeKeys.has(key)) throw new Error("Duplicate RIPE Atlas probe.");
    probeIds.add(id);
    probeKeys.add(key);
    return { id, key, label, provider, asn, city };
  });

  const nodeIds = new Set<string>();
  const measurementIds = new Set<number>();
  const measurements = value.measurements.map((candidate) => {
    if (!candidate || typeof candidate !== "object") throw new Error("Invalid RIPE Atlas measurement entry.");
    const measurement = candidate as Record<string, unknown>;
    const nodeId = boundedString(measurement.nodeId, 64);
    const measurementId = positiveInteger(measurement.measurementId);
    if (!nodeId || !/^[A-Za-z0-9._-]+$/.test(nodeId) || !measurementId) {
      throw new Error("Invalid RIPE Atlas measurement fields.");
    }
    if (nodeIds.has(nodeId) || measurementIds.has(measurementId)) {
      throw new Error("Duplicate RIPE Atlas node or measurement ID.");
    }
    nodeIds.add(nodeId);
    measurementIds.add(measurementId);
    return { nodeId, measurementId };
  });

  const createdAt = boundedString(value.createdAt, 64) ?? new Date(0).toISOString();
  return {
    version: 1,
    provider: "ripe-atlas",
    createdAt,
    intervalSeconds,
    probes,
    measurements
  };
}

export function loadRipeAtlasConfig(path: string): RipeAtlasConfig {
  return parseRipeAtlasConfig(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

function metricLabels(
  nodeId: string,
  measurementId: number,
  probe: RipeAtlasProbeConfig
): Record<string, string> {
  return {
    node_id: nodeId,
    vantage: probe.key,
    vantage_name: probe.label,
    provider: probe.provider,
    probe_id: String(probe.id),
    asn: `AS${probe.asn}`,
    city: probe.city,
    measurement_id: String(measurementId)
  };
}

function clearProbeResult(labels: Record<string, string>, timestamp: number): void {
  ripeAtlasRttMilliseconds.remove(labels);
  ripeAtlasProbeSuccess.set(labels, 0);
  ripeAtlasResultTimestampSeconds.set(labels, timestamp);
}

async function fetchLatest(
  fetchImpl: FetchLike,
  measurementId: number,
  probeIds: number[],
  timeoutMs: number
): Promise<LatestResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref();
  try {
    const url = new URL(`${RIPE_ATLAS_API}/measurements/${measurementId}/latest/`);
    url.searchParams.set("probe_ids", probeIds.join(","));
    url.searchParams.set("versions", "1");
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`RIPE Atlas latest returned HTTP ${response.status}.`);
    return await response.json() as LatestResponse;
  } finally {
    clearTimeout(timeout);
  }
}

function latestResultForProbe(response: LatestResponse, probeId: number): RipeAtlasPingResult | undefined {
  if (Array.isArray(response)) {
    return response
      .filter((result) => result.prb_id === probeId)
      .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0))[0];
  }
  return response[String(probeId)]?.[0];
}

export async function collectRipeAtlasMeasurements(
  config: RipeAtlasConfig,
  options: {
    fetchImpl?: FetchLike;
    timeoutMs?: number;
    nowSeconds?: number;
  } = {}
): Promise<void> {
  const endTimer = ripeAtlasCollectionDurationSeconds.startTimer();
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const probeIds = config.probes.map((probe) => probe.id);
  let failures = 0;

  await Promise.all(config.measurements.map(async (measurement) => {
    try {
      const latest = await fetchLatest(fetchImpl, measurement.measurementId, probeIds, timeoutMs);
      for (const probe of config.probes) {
        const labels = metricLabels(measurement.nodeId, measurement.measurementId, probe);
        const result = latestResultForProbe(latest, probe.id);
        const timestamp = positiveInteger(result?.timestamp) ?? 0;
        const average = typeof result?.avg === "number" && Number.isFinite(result.avg) && result.avg >= 0
          ? result.avg
          : null;
        const received = typeof result?.rcvd === "number" ? result.rcvd : 0;
        const fresh = timestamp > 0 && nowSeconds - timestamp <= config.intervalSeconds * 3;
        if (result?.type === "ping" && average !== null && received > 0 && fresh) {
          ripeAtlasRttMilliseconds.set(labels, average);
          ripeAtlasProbeSuccess.set(labels, 1);
          ripeAtlasResultTimestampSeconds.set(labels, timestamp);
        } else {
          clearProbeResult(labels, timestamp);
        }
      }
      ripeAtlasCollectionRequestsTotal.inc({ outcome: "success" });
    } catch {
      failures += 1;
      ripeAtlasCollectionRequestsTotal.inc({ outcome: "error" });
      for (const probe of config.probes) {
        clearProbeResult(metricLabels(measurement.nodeId, measurement.measurementId, probe), 0);
      }
    }
  }));

  if (failures === 0) {
    ripeAtlasLastCollectionSuccessTimestampSeconds.set(nowSeconds);
  }
  endTimer();
  if (failures > 0) throw new Error(`${failures} RIPE Atlas measurement request(s) failed.`);
}

export function startRipeAtlasCollector(
  env: ApiEnv,
  logger: RipeAtlasCollectorLogger,
  options: { fetchImpl?: FetchLike; pollIntervalMs?: number } = {}
): () => void {
  if (!env.ripeAtlasConfigPath) return () => undefined;

  let config: RipeAtlasConfig;
  try {
    config = loadRipeAtlasConfig(env.ripeAtlasConfigPath);
  } catch (error) {
    logger.warn({ error, path: env.ripeAtlasConfigPath }, "RIPE Atlas collector disabled: invalid or missing config");
    return () => undefined;
  }

  let stopped = false;
  let inFlight = false;
  const collect = async () => {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      await collectRipeAtlasMeasurements(config, {
        fetchImpl: options.fetchImpl,
        timeoutMs: env.ripeAtlasTimeoutMs
      });
    } catch (error) {
      logger.warn({ error }, "RIPE Atlas result collection failed");
    } finally {
      inFlight = false;
    }
  };
  void collect();
  const timer = setInterval(() => void collect(), options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  timer.unref();
  logger.info(
    { measurements: config.measurements.length, probes: config.probes.length },
    "RIPE Atlas collector enabled"
  );
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
