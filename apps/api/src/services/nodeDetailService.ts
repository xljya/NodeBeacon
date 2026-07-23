import type {
  ApiNodeDetailSeriesResponse,
  ApiNodeDetailV2Response,
  DetailAggregation,
  DetailChartMetric,
  NodeConfigEntry,
  NodeDetailCapabilities,
  NodeDetailDiskMetric,
  NodeDetailLiveMetrics,
  NodeDetailSeries,
  NodeDetailSystemProfile,
  NodeMeta,
  StatusNode
} from "@nodebeacon/shared";
import type { PrometheusClient, PrometheusMatrixResult, PrometheusVectorResult } from "./prometheusClient.js";
import {
  filesystemTypeExclude,
  metric,
  networkDeviceExclude,
  type LabelMatcher
} from "./metricsService.js";

const DETAIL_FAST_JOB = "node-detail-fast";
const MAX_RANGE_SECONDS = 90 * 24 * 60 * 60;
const TARGET_POINTS = 720;
const DEFAULT_REALTIME_SECONDS = 15 * 60;

interface Cached<T> {
  expiresAt: number;
  value: T;
}

const detailCache = new Map<string, Cached<ApiNodeDetailV2Response>>();
const seriesCache = new Map<string, Cached<ApiNodeDetailSeriesResponse>>();
const fastAvailabilityCache = new Map<string, Cached<boolean>>();
const fastAvailabilityInFlight = new Map<string, Promise<boolean>>();

function finite(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function nonNegative(value: number | null): number | null {
  const parsed = finite(value);
  return parsed === null ? null : Math.max(0, parsed);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nodeMeta(node: StatusNode): NodeMeta {
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

function normalLabels(node: NodeConfigEntry): Record<string, string> {
  return node.labels;
}

function fastLabels(node: NodeConfigEntry): Record<string, string> {
  return {
    job: DETAIL_FAST_JOB,
    node_id: node.id
  };
}

function filesystemMatchers(node: NodeConfigEntry): LabelMatcher[] {
  const matchers: LabelMatcher[] = [{ name: "fstype", operator: "!~", value: filesystemTypeExclude }];
  const mounts = node.detail?.diskMounts?.filter(Boolean) ?? [];
  if (mounts.length === 1) {
    matchers.push({ name: "mountpoint", operator: "=", value: mounts[0] ?? "/" });
  } else if (mounts.length > 1) {
    matchers.push({ name: "mountpoint", operator: "=~", value: mounts.map(escapeRegex).join("|") });
  }
  return matchers;
}

function networkMatchers(node: NodeConfigEntry): LabelMatcher[] {
  const devices = node.detail?.networkDevices?.filter(Boolean) ?? [];
  if (devices.length === 1) {
    return [{ name: "device", operator: "=", value: devices[0] ?? "eth0" }];
  }
  if (devices.length > 1) {
    return [{ name: "device", operator: "=~", value: devices.map(escapeRegex).join("|") }];
  }
  return [{ name: "device", operator: "!~", value: networkDeviceExclude }];
}

function firstValue(results: PrometheusVectorResult[]): number | null {
  const raw = results[0]?.value?.[1];
  const value = raw === undefined ? null : Number(raw);
  return finite(value);
}

function firstMetric(results: PrometheusVectorResult[]): Record<string, string> | null {
  return results[0]?.metric ?? null;
}

async function queryNumber(client: PrometheusClient | null, query: string): Promise<number | null> {
  if (!client) return null;
  try {
    return firstValue(await client.query(query));
  } catch {
    return null;
  }
}

async function queryVector(client: PrometheusClient | null, query: string): Promise<PrometheusVectorResult[]> {
  if (!client) return [];
  try {
    return await client.query(query);
  } catch {
    return [];
  }
}

async function hasFastJob(client: PrometheusClient | null, node: NodeConfigEntry): Promise<boolean> {
  if (!client) return false;
  const key = node.id;
  const cached = fastAvailabilityCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const inFlight = fastAvailabilityInFlight.get(key);
  if (inFlight) return inFlight;
  const promise = queryVector(client, metric("up", fastLabels(node)))
    .then((results) => results.some((result) => Number(result.value[1]) > 0))
    .catch(() => false)
    .then((available) => {
      fastAvailabilityCache.set(key, { expiresAt: Date.now() + 30_000, value: available });
      fastAvailabilityInFlight.delete(key);
      return available;
    });
  fastAvailabilityInFlight.set(key, promise);
  return promise;
}

async function queryWithFastFallback(
  client: PrometheusClient | null,
  node: NodeConfigEntry,
  builder: (labels: Record<string, string>) => string
): Promise<number | null> {
  if (!client) return null;
  if (!(await hasFastJob(client, node))) return queryNumber(client, builder(normalLabels(node)));
  const fast = await queryNumber(client, builder(fastLabels(node)));
  return fast ?? queryNumber(client, builder(normalLabels(node)));
}

async function queryVectorWithFastFallback(
  client: PrometheusClient | null,
  node: NodeConfigEntry,
  builder: (labels: Record<string, string>) => string
): Promise<PrometheusVectorResult[]> {
  if (!client) return [];
  if (!(await hasFastJob(client, node))) return queryVector(client, builder(normalLabels(node)));
  const fast = await queryVector(client, builder(fastLabels(node)));
  return fast.length ? fast : queryVector(client, builder(normalLabels(node)));
}

function buildProfile(
  node: NodeConfigEntry,
  statusNode: StatusNode | undefined,
  uname: Record<string, string> | null,
  os: Record<string, string> | null,
  dmi: Record<string, string> | null,
  logicalCpuCores: number | null
): NodeDetailSystemProfile {
  const override = node.detail?.profileOverride;
  const osName = os?.pretty_name ?? os?.name ?? statusNode?.os.name ?? null;
  const osVersion = os?.version ?? os?.version_id ?? null;
  const kernelVersion = uname?.release ?? null;
  const arch = uname?.machine ?? statusNode?.os.arch ?? null;
  const virtualization = override?.virtualization
    ?? (dmi?.system_vendor || dmi?.chassis_vendor
      ? [dmi.system_vendor, dmi.chassis_vendor].filter(Boolean).join(" / ")
      : null);
  return {
    osName,
    osVersion,
    kernelVersion,
    arch,
    virtualization,
    cpuModel: override?.cpuModel ?? null,
    logicalCpuCores,
    physicalCpuCores: override?.physicalCpuCores ?? null,
    gpuModel: override?.gpuModel ?? null
  };
}

function buildCapabilities(node: NodeConfigEntry, profile: NodeDetailSystemProfile, disks: NodeDetailDiskMetric[]): NodeDetailCapabilities {
  return {
    realtime: true,
    cpuModel: Boolean(profile.cpuModel),
    gpu: profile.gpuModel !== null,
    swap: true,
    multiDisk: disks.length > 1,
    processTotal: false,
    latency: Boolean(node.detail?.latencyVantages?.length)
  };
}

async function buildDisks(client: PrometheusClient | null, node: NodeConfigEntry): Promise<NodeDetailDiskMetric[]> {
  const [sizeResults, availResults] = await Promise.all([
    queryVectorWithFastFallback(
      client,
      node,
      (labels) => metric("node_filesystem_size_bytes", labels, filesystemMatchers(node))
    ),
    queryVectorWithFastFallback(
      client,
      node,
      (labels) => metric("node_filesystem_avail_bytes", labels, filesystemMatchers(node))
    )
  ]);
  const availByMount = new Map(availResults.map((result) => [result.metric.mountpoint ?? "", Number(result.value[1])]));
  const disks: NodeDetailDiskMetric[] = [];
  for (const result of sizeResults) {
    const mountpoint = result.metric.mountpoint ?? "/";
    const totalBytes = nonNegative(Number(result.value[1]));
    const availBytes = nonNegative(availByMount.get(mountpoint) ?? null);
    const usedBytes = totalBytes === null || availBytes === null ? null : Math.max(0, totalBytes - availBytes);
    disks.push({
      id: mountpoint,
      label: mountpoint === "/" ? "Root disk" : mountpoint,
      mountpoint,
      usedBytes,
      totalBytes,
      usedPercent: totalBytes && usedBytes !== null ? Math.min(100, (usedBytes / totalBytes) * 100) : null
    });
  }
  return disks.sort((a, b) => (a.mountpoint ?? "").localeCompare(b.mountpoint ?? ""));
}

async function buildLive(
  client: PrometheusClient | null,
  node: NodeConfigEntry,
  statusNode: StatusNode | undefined,
  disks: NodeDetailDiskMetric[]
): Promise<NodeDetailLiveMetrics> {
  const [
    cpu, memoryTotal, memoryAvailable, swapTotal, swapFree, load1, load5, load15,
    rx, tx, rxTotal, txTotal, tcp, udp, running, blocked, uptime, reportAt
  ] = await Promise.all([
    queryWithFastFallback(client, node, (labels) => {
      const idle = metric("node_cpu_seconds_total", labels, [{ name: "mode", operator: "=", value: "idle" }]);
      return `100 * (1 - avg(rate(${idle}[30s])))`;
    }),
    queryWithFastFallback(client, node, (labels) => metric("node_memory_MemTotal_bytes", labels)),
    queryWithFastFallback(client, node, (labels) => metric("node_memory_MemAvailable_bytes", labels)),
    queryWithFastFallback(client, node, (labels) => metric("node_memory_SwapTotal_bytes", labels)),
    queryWithFastFallback(client, node, (labels) => metric("node_memory_SwapFree_bytes", labels)),
    queryWithFastFallback(client, node, (labels) => metric("node_load1", labels)),
    queryWithFastFallback(client, node, (labels) => metric("node_load5", labels)),
    queryWithFastFallback(client, node, (labels) => metric("node_load15", labels)),
    queryWithFastFallback(client, node, (labels) => `sum(rate(${metric("node_network_receive_bytes_total", labels, networkMatchers(node))}[30s]))`),
    queryWithFastFallback(client, node, (labels) => `sum(rate(${metric("node_network_transmit_bytes_total", labels, networkMatchers(node))}[30s]))`),
    queryNumber(client, `sum(${metric("node_network_receive_bytes_total", normalLabels(node), networkMatchers(node))})`),
    queryNumber(client, `sum(${metric("node_network_transmit_bytes_total", normalLabels(node), networkMatchers(node))})`),
    queryWithFastFallback(client, node, (labels) => metric("node_sockstat_TCP_alloc", labels)),
    queryWithFastFallback(client, node, (labels) => metric("node_sockstat_UDP_inuse", labels)),
    queryWithFastFallback(client, node, (labels) => metric("node_procs_running", labels)),
    queryWithFastFallback(client, node, (labels) => metric("node_procs_blocked", labels)),
    queryWithFastFallback(client, node, (labels) => `time() - ${metric("node_boot_time_seconds", labels)}`),
    queryWithFastFallback(client, node, (labels) => `timestamp(last_over_time(${metric("node_time_seconds", labels)}[90d]))`)
  ]);

  const fallback = statusNode?.metrics;
  const resolvedMemoryTotal = memoryTotal ?? fallback?.memoryTotalBytes ?? null;
  const resolvedMemoryUsed = memoryTotal !== null && memoryAvailable !== null
    ? Math.max(0, memoryTotal - memoryAvailable)
    : fallback?.memoryUsedBytes ?? null;
  const resolvedSwapTotal = swapTotal;
  const resolvedSwapUsed = swapTotal !== null && swapFree !== null ? Math.max(0, swapTotal - swapFree) : null;
  return {
    cpuPercent: cpu ?? fallback?.cpuPercent ?? null,
    load1: load1 ?? fallback?.load1 ?? null,
    load5,
    load15,
    memoryUsedBytes: resolvedMemoryUsed,
    memoryTotalBytes: resolvedMemoryTotal,
    swapUsedBytes: resolvedSwapUsed,
    swapTotalBytes: resolvedSwapTotal,
    disks,
    networkRxBytesPerSecond: rx ?? fallback?.networkRxBytesPerSecond ?? null,
    networkTxBytesPerSecond: tx ?? fallback?.networkTxBytesPerSecond ?? null,
    networkRxBytesTotal: rxTotal ?? fallback?.networkRxBytesTotal ?? null,
    networkTxBytesTotal: txTotal ?? fallback?.networkTxBytesTotal ?? null,
    tcpConnections: tcp,
    udpConnections: udp,
    processRunning: running,
    processBlocked: blocked,
    processTotal: null,
    uptimeSeconds: uptime ?? fallback?.uptimeSeconds ?? null,
    lastReportAt: reportAt === null ? null : new Date(reportAt * 1000).toISOString()
  };
}

export async function getNodeDetail(
  client: PrometheusClient | null,
  node: NodeConfigEntry,
  statusNode: StatusNode | undefined,
  generatedAt: string
): Promise<ApiNodeDetailV2Response> {
  const cacheKey = `${node.id}|${node.detail?.visibility ?? "safe"}`;
  const cached = detailCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const [unameResults, osResults, dmiResults, logicalCpuCores, disks] = await Promise.all([
    queryVector(client, metric("node_uname_info", normalLabels(node))),
    queryVector(client, metric("node_os_info", normalLabels(node))),
    queryVector(client, metric("node_dmi_info", normalLabels(node))),
    queryWithFastFallback(client, node, (labels) => `count(${metric("node_cpu_seconds_total", labels, [{ name: "mode", operator: "=", value: "idle" }])})`),
    buildDisks(client, node)
  ]);
  const profile = buildProfile(node, statusNode, firstMetric(unameResults), firstMetric(osResults), firstMetric(dmiResults), logicalCpuCores);
  const live = await buildLive(client, node, statusNode, disks);
  const response: ApiNodeDetailV2Response = {
    generatedAt,
    node: statusNode ? nodeMeta(statusNode) : {
      id: node.id,
      name: node.name,
      provider: node.provider,
      group: node.group,
      region: node.region,
      location: node.location,
      displayOrder: node.displayOrder,
      tags: node.tags,
      online: false,
      status: "unknown",
      updatedAt: generatedAt
    },
    profile,
    capabilities: buildCapabilities(node, profile, disks),
    live
  };
  detailCache.set(cacheKey, { expiresAt: Date.now() + 4_000, value: response });
  if (detailCache.size > 100) detailCache.clear();
  return response;
}

function rangePreset(range: string): { startSeconds: number; endSeconds: number; stepSeconds: number } | null {
  const endSeconds = Math.floor(Date.now() / 1000);
  const seconds = range === "realtime" ? DEFAULT_REALTIME_SECONDS
    : range === "1d" ? 24 * 60 * 60
      : range === "7d" ? 7 * 24 * 60 * 60
        : range === "30d" ? 30 * 24 * 60 * 60
          : range === "60d" ? 60 * 24 * 60 * 60 : null;
  if (seconds === null) return null;
  return { startSeconds: endSeconds - seconds, endSeconds, stepSeconds: Math.max(5, Math.ceil(seconds / TARGET_POINTS)) };
}

export function aggregationExpression(
  expression: string,
  aggregation: DetailAggregation,
  stepSeconds: number
): string {
  const window = Math.max(stepSeconds * 2, 30);
  const rangeVector = `(${expression})[${window}s:${stepSeconds}s]`;
  switch (aggregation) {
    case "avg":
      return `avg_over_time(${rangeVector})`;
    case "min":
      return `min_over_time(${rangeVector})`;
    case "max":
      return `max_over_time(${rangeVector})`;
    case "first":
      // first_over_time is still experimental in the production Prometheus
      // version. Sample the beginning of the reduction window with an offset
      // and use the stable last_over_time function for the narrow edge window.
      return `last_over_time((${expression})[${stepSeconds}s:${stepSeconds}s] offset ${window - stepSeconds}s)`;
    case "last":
      return `last_over_time(${rangeVector})`;
    case "stddev":
      return `stddev_over_time(${rangeVector})`;
    case "p70":
      return `quantile_over_time(0.70, ${rangeVector})`;
    case "p95":
      return `quantile_over_time(0.95, ${rangeVector})`;
    case "p99":
      return `quantile_over_time(0.99, ${rangeVector})`;
  }
}

interface DetailQuerySpec {
  key: string;
  unit: NodeDetailSeries["unit"];
  labels?: Record<string, string>;
  query: (labels: Record<string, string>) => string;
}

function querySpecs(metricName: DetailChartMetric, node: NodeConfigEntry): DetailQuerySpec[] {
  const fs = filesystemMatchers(node);
  const net = networkMatchers(node);
  switch (metricName) {
    case "cpu":
      return [
        {
          key: "cpu",
          unit: "percent",
          query: (labels) => {
            const idle = metric("node_cpu_seconds_total", labels, [{ name: "mode", operator: "=", value: "idle" }]);
            return `100 * (1 - avg(rate(${idle}[2m])))`;
          }
        },
        { key: "load1", unit: "load", query: (labels) => metric("node_load1", labels) }
      ];
    case "memory":
      return [{
        key: "ram",
        unit: "bytes",
        query: (labels) => `${metric("node_memory_MemTotal_bytes", labels)} - ${metric("node_memory_MemAvailable_bytes", labels)}`
      }];
    case "swap":
      return [{
        key: "swap",
        unit: "bytes",
        query: (labels) => `${metric("node_memory_SwapTotal_bytes", labels)} - ${metric("node_memory_SwapFree_bytes", labels)}`
      }];
    case "disk":
      return [{
        key: "disk",
        unit: "bytes",
        query: (labels) => `${metric("node_filesystem_size_bytes", labels, fs)} - ${metric("node_filesystem_avail_bytes", labels, fs)}`
      }];
    case "network":
      return [
        { key: "rx", unit: "bytes_per_second", query: (labels) => `sum(rate(${metric("node_network_receive_bytes_total", labels, net)}[2m]))` },
        { key: "tx", unit: "bytes_per_second", query: (labels) => `sum(rate(${metric("node_network_transmit_bytes_total", labels, net)}[2m]))` },
        { key: "rxTotal", unit: "bytes", query: (labels) => `sum(${metric("node_network_receive_bytes_total", labels, net)})` },
        { key: "txTotal", unit: "bytes", query: (labels) => `sum(${metric("node_network_transmit_bytes_total", labels, net)})` }
      ];
    case "latency":
      return [{
        key: "ping",
        unit: "milliseconds",
        query: () => {
          const ripeAtlas = metric("nodebeacon_ripe_atlas_rtt_milliseconds", { node_id: node.id });
          if (node.id === "rs1000") return ripeAtlas;
          const rs1000 = `1000 * ${metric(
            "probe_duration_seconds",
            { job: "blackbox-tcp-wireguard", node_id: "rs1000" },
            [{ name: "peer", operator: "=", value: node.id }]
          )}`;
          // Preserve the existing RS1000 blackbox series only until RIPE Atlas
          // has produced at least one real vantage result for this node.
          return `${ripeAtlas} or (${rs1000} unless on() ${ripeAtlas})`;
        }
      }];
    case "connections":
      return [
        { key: "tcp", unit: "count", query: (labels) => metric("node_sockstat_TCP_alloc", labels) },
        { key: "udp", unit: "count", query: (labels) => metric("node_sockstat_UDP_inuse", labels) },
        { key: "running", unit: "count", query: (labels) => metric("node_procs_running", labels) }
      ];
  }
}

function matrixPoints(result: PrometheusMatrixResult): Array<[number, number | null]> {
  return result.values.map(([timestamp, raw]) => {
    const value = Number(raw);
    return [timestamp, Number.isFinite(value) ? value : null];
  });
}

function dataBounds(series: NodeDetailSeries[]): { from: string | null; to: string | null } {
  const timestamps = series.flatMap((item) => item.points.map(([timestamp]) => timestamp));
  if (!timestamps.length) return { from: null, to: null };
  return {
    from: new Date(Math.min(...timestamps) * 1000).toISOString(),
    to: new Date(Math.max(...timestamps) * 1000).toISOString()
  };
}

export function calculateDetailRange(
  range: string | undefined,
  from: string | undefined,
  to: string | undefined
): { startSeconds: number; endSeconds: number; stepSeconds: number } | null {
  if (range && range !== "custom") return rangePreset(range);
  if (!from || !to) return null;
  const startSeconds = Math.floor(Date.parse(from) / 1000);
  const requestedEnd = Math.floor(Date.parse(to) / 1000);
  if (!Number.isFinite(startSeconds) || !Number.isFinite(requestedEnd)) return null;
  const endSeconds = Math.min(Math.floor(Date.now() / 1000), requestedEnd);
  if (startSeconds >= endSeconds || endSeconds - startSeconds > MAX_RANGE_SECONDS) return null;
  return { startSeconds, endSeconds, stepSeconds: Math.max(5, Math.ceil((endSeconds - startSeconds) / TARGET_POINTS)) };
}

export async function getNodeDetailSeries(
  client: PrometheusClient,
  node: NodeConfigEntry,
  metricNames: DetailChartMetric[],
  range: { startSeconds: number; endSeconds: number; stepSeconds: number },
  aggregation: DetailAggregation
): Promise<ApiNodeDetailSeriesResponse> {
  const roundedStart = Math.floor(range.startSeconds / range.stepSeconds) * range.stepSeconds;
  const roundedEnd = Math.floor(range.endSeconds / range.stepSeconds) * range.stepSeconds;
  const key = `${node.id}|${metricNames.join(",")}|${roundedStart}|${roundedEnd}|${range.stepSeconds}|${aggregation}`;
  const cached = seriesCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const series: NodeDetailSeries[] = [];
  for (const metricName of metricNames) {
    const specs = querySpecs(metricName, node);
    const results = await Promise.all(specs.map(async (spec) => {
      const query = aggregationExpression(spec.query(normalLabels(node)), aggregation, range.stepSeconds);
      const matrix = await client.queryRange(query, roundedStart, roundedEnd, range.stepSeconds);
      return { spec, matrix };
    }));
    for (const { spec, matrix } of results) {
      for (const result of matrix) {
        const labels = {
          ...spec.labels,
          ...Object.fromEntries(
          Object.entries(result.metric).filter(([name]) => [
            "mountpoint",
            "device",
            "peer",
            "vantage",
            "vantage_name",
            "provider",
            "probe_id",
            "asn",
            "city",
            "measurement_id"
          ].includes(name))
          )
        };
        series.push({ metric: metricName, key: spec.key, unit: spec.unit, labels, points: matrixPoints(result) });
      }
      if (!matrix.length) {
        series.push({ metric: metricName, key: spec.key, unit: spec.unit, points: [] });
      }
    }
  }
  const bounds = dataBounds(series);
  const value: ApiNodeDetailSeriesResponse = {
    nodeId: node.id,
    from: new Date(range.startSeconds * 1000).toISOString(),
    to: new Date(range.endSeconds * 1000).toISOString(),
    dataFrom: bounds.from,
    dataTo: bounds.to,
    stepSeconds: range.stepSeconds,
    aggregation,
    series
  };
  seriesCache.set(key, { expiresAt: Date.now() + (range.endSeconds - range.startSeconds <= 24 * 60 * 60 ? 30_000 : 300_000), value });
  if (seriesCache.size > 300) seriesCache.clear();
  return value;
}

export function clearNodeDetailCache(): void {
  detailCache.clear();
  seriesCache.clear();
  fastAvailabilityCache.clear();
  fastAvailabilityInFlight.clear();
}
