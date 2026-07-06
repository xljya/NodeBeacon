import type { NodeConfigEntry, StatusMetricSet, StatusNode } from "@nodebeacon/shared";
import type { PrometheusClient } from "./prometheusClient.js";

interface QueryNumberResult {
  ok: boolean;
  value: number | null;
}

interface NodeMetricBuildResult {
  node: StatusNode;
  queryCount: number;
  failedQueryCount: number;
}

export interface MetricsBuildResult {
  nodes: StatusNode[];
  queryCount: number;
  failedQueryCount: number;
}

type MatcherOperator = "=" | "!=" | "=~" | "!~";
type NodeMetricName =
  | "up"
  | "cpu"
  | "memoryTotal"
  | "memoryAvailable"
  | "diskTotal"
  | "diskFree"
  | "load1"
  | "uptime"
  | "networkRx"
  | "networkTx";

interface LabelMatcher {
  name: string;
  operator: MatcherOperator;
  value: string;
}

const networkDeviceExclude = "lo|docker.*|veth.*|br-.*|cni.*|flannel.*";
const filesystemTypeExclude = "tmpfs|devtmpfs|overlay|squashfs|nsfs";

function clampPercent(value: number | null): number {
  if (value === null) return 0;
  return Math.max(0, Math.min(100, value));
}

function finiteOrZero(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, "\\\"");
}

function buildSelector(labels: Record<string, string>, extra: LabelMatcher[] = []): string {
  const matchers: LabelMatcher[] = [
    ...Object.entries(labels).map(([name, value]) => ({ name, operator: "=" as const, value })),
    ...extra
  ].filter((matcher) => matcher.name && matcher.value);

  if (!matchers.length) return "";

  return `{${matchers
    .map((matcher) => `${matcher.name}${matcher.operator}"${escapeLabelValue(matcher.value)}"`)
    .join(",")}}`;
}

function metric(name: string, labels: Record<string, string>, extra: LabelMatcher[] = []): string {
  return `${name}${buildSelector(labels, extra)}`;
}

function withDefaultMetrics(): StatusMetricSet {
  return {
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
    networkTxBytesPerSecond: 0
  };
}

async function queryNumber(client: PrometheusClient, query: string): Promise<QueryNumberResult> {
  try {
    return {
      ok: true,
      value: await client.queryNumber(query)
    };
  } catch {
    return {
      ok: false,
      value: null
    };
  }
}

function buildQueries(labels: Record<string, string>): Record<NodeMetricName, string> {
  const idleCpu = metric("node_cpu_seconds_total", labels, [{ name: "mode", operator: "=", value: "idle" }]);
  const rootFsExtra: LabelMatcher[] = [
    { name: "mountpoint", operator: "=", value: "/" },
    { name: "fstype", operator: "!~", value: filesystemTypeExclude }
  ];
  const networkExtra: LabelMatcher[] = [
    { name: "device", operator: "!~", value: networkDeviceExclude }
  ];

  return {
    up: metric("up", labels),
    cpu: `100 * (1 - avg(rate(${idleCpu}[5m])))`,
    memoryTotal: metric("node_memory_MemTotal_bytes", labels),
    memoryAvailable: metric("node_memory_MemAvailable_bytes", labels),
    diskTotal: `max(${metric("node_filesystem_size_bytes", labels, rootFsExtra)})`,
    diskFree: `max(${metric("node_filesystem_free_bytes", labels, rootFsExtra)})`,
    load1: metric("node_load1", labels),
    uptime: `time() - ${metric("node_boot_time_seconds", labels)}`,
    networkRx: `sum(rate(${metric("node_network_receive_bytes_total", labels, networkExtra)}[1m]))`,
    networkTx: `sum(rate(${metric("node_network_transmit_bytes_total", labels, networkExtra)}[1m]))`
  };
}

function emptyQueryNumberResult(): QueryNumberResult {
  return {
    ok: false,
    value: null
  };
}

async function buildNodeStatus(
  client: PrometheusClient,
  node: NodeConfigEntry,
  os: StatusNode["os"],
  now: string
): Promise<NodeMetricBuildResult> {
  const queries = buildQueries(node.labels);
  const entries = Object.entries(queries);
  const results = await Promise.all(entries.map(async ([name, query]) => [name, await queryNumber(client, query)] as const));
  const values = new Map<NodeMetricName, QueryNumberResult>(
    results.map(([name, result]) => [name as NodeMetricName, result])
  );
  const valueOf = (name: NodeMetricName): QueryNumberResult => values.get(name) ?? emptyQueryNumberResult();
  const queryCount = entries.length;
  const failedQueryCount = results.filter(([, result]) => !result.ok).length;

  const up = valueOf("up").value;
  const memoryTotalBytes = finiteOrZero(valueOf("memoryTotal").value);
  const memoryAvailableBytes = finiteOrZero(valueOf("memoryAvailable").value);
  const memoryUsedBytes = Math.max(0, memoryTotalBytes - memoryAvailableBytes);
  const diskTotalBytes = finiteOrZero(valueOf("diskTotal").value);
  const diskFreeBytes = finiteOrZero(valueOf("diskFree").value);
  const diskUsedBytes = Math.max(0, diskTotalBytes - diskFreeBytes);
  const missingRequiredMetric = [
    valueOf("cpu").value,
    valueOf("memoryTotal").value,
    valueOf("memoryAvailable").value,
    valueOf("diskTotal").value,
    valueOf("diskFree").value,
    valueOf("load1").value,
    valueOf("uptime").value,
    valueOf("networkRx").value,
    valueOf("networkTx").value
  ].some((value) => value === null);

  const online = up !== null ? up > 0 : false;
  const status = up === null
    ? "unknown"
    : !online
      ? "offline"
      : missingRequiredMetric || failedQueryCount > 0
        ? "degraded"
        : "online";

  return {
    queryCount,
    failedQueryCount,
    node: {
      ...node,
      online,
      status,
      os,
      metrics: {
        ...withDefaultMetrics(),
        cpuPercent: clampPercent(valueOf("cpu").value),
        memoryPercent: memoryTotalBytes > 0 ? clampPercent((memoryUsedBytes / memoryTotalBytes) * 100) : 0,
        memoryUsedBytes,
        memoryTotalBytes,
        diskPercent: diskTotalBytes > 0 ? clampPercent((diskUsedBytes / diskTotalBytes) * 100) : 0,
        diskUsedBytes,
        diskTotalBytes,
        load1: finiteOrZero(valueOf("load1").value),
        uptimeSeconds: finiteOrZero(valueOf("uptime").value),
        networkRxBytesPerSecond: finiteOrZero(valueOf("networkRx").value),
        networkTxBytesPerSecond: finiteOrZero(valueOf("networkTx").value)
      },
      updatedAt: now
    }
  };
}

export async function buildStatusFromPrometheus(
  client: PrometheusClient,
  registry: NodeConfigEntry[],
  fallbackOsById: Map<string, StatusNode["os"]>,
  now: string
): Promise<MetricsBuildResult> {
  const nodes = await Promise.all(
    registry.map((node) => buildNodeStatus(
      client,
      node,
      fallbackOsById.get(node.id) ?? { name: "Linux", arch: "amd64" },
      now
    ))
  );

  return {
    nodes: nodes.map((result) => result.node),
    queryCount: nodes.reduce((sum, result) => sum + result.queryCount, 0),
    failedQueryCount: nodes.reduce((sum, result) => sum + result.failedQueryCount, 0)
  };
}
