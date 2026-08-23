import type { NodeBasicInfo } from "@/contexts/NodeListContext";
import type { LiveDataResponse, Record as LiveRecord } from "@/types/LiveData";

export type NodeBeaconStatus = "online" | "offline" | "degraded" | "unknown";

export interface NodeBeaconStatusNode {
  id: string;
  name: string;
  provider: string;
  group: string;
  region: string;
  countryCode?: string;
  location?: string;
  displayOrder: number;
  public: boolean;
  tags: string[];
  online: boolean;
  status: NodeBeaconStatus;
  os: { name: string; arch: string };
  metrics: {
    cpuPercent: number;
    memoryPercent: number;
    memoryUsedBytes: number;
    memoryTotalBytes: number;
    diskPercent: number;
    diskUsedBytes: number;
    diskTotalBytes: number;
    load1: number;
    uptimeSeconds: number;
    networkRxBytesPerSecond: number;
    networkTxBytesPerSecond: number;
    networkRxBytesTotal: number;
    networkTxBytesTotal: number;
  };
  updatedAt: string;
}

export interface NodeBeaconStatusResponse {
  generatedAt: string;
  cache: { ttlSeconds: number; stale: boolean };
  nodes: NodeBeaconStatusNode[];
}

export interface NodeBeaconSiteConfig {
  site: {
    name: string;
    description: string;
    defaultLocale: "en" | "zh-CN" | "zh-TW";
    timezone: string;
  };
  theme: {
    id: string;
    name: string;
    tokens: {
      mode: "system" | "light" | "dark";
      accent: string;
      scaling: string;
      radius: string;
      panelBackground: string;
    };
  };
}

export interface NodeBeaconAuthConfig {
  passwordLoginEnabled: boolean;
  githubLoginEnabled: boolean;
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as
      | { error?: { message?: string }; message?: string }
      | null;
    throw new Error(body?.error?.message ?? body?.message ?? `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

let statusRequest: Promise<NodeBeaconStatusResponse> | null = null;
let statusSnapshot: NodeBeaconStatusResponse | null = null;
let statusFetchedAt = 0;

export async function fetchStatus(force = false): Promise<NodeBeaconStatusResponse> {
  if (!force && statusSnapshot && Date.now() - statusFetchedAt < 1_000) {
    return statusSnapshot;
  }
  if (!statusRequest) {
    statusRequest = fetchJson<NodeBeaconStatusResponse>("/api/status")
      .then((status) => {
        statusSnapshot = status;
        statusFetchedAt = Date.now();
        return status;
      })
      .finally(() => {
        statusRequest = null;
      });
  }
  return statusRequest;
}

export function toKomariNode(node: NodeBeaconStatusNode): NodeBasicInfo {
  return {
    uuid: node.id,
    name: node.name,
    cpu_name: "",
    virtualization: "",
    arch: node.os.arch,
    cpu_cores: 0,
    os: node.os.name,
    kernel_version: "",
    gpu_name: "",
    region: node.countryCode ?? node.region,
    mem_total: node.metrics.memoryTotalBytes,
    swap_total: 0,
    disk_total: node.metrics.diskTotalBytes,
    version: "",
    weight: node.displayOrder,
    price: 0,
    tags: node.tags.join(";"),
    billing_cycle: 0,
    currency: "",
    group: node.group,
    traffic_limit: 0,
    traffic_limit_type: undefined,
    expired_at: "",
    created_at: "",
    updated_at: node.updatedAt,
  };
}

export function toKomariLiveRecord(node: NodeBeaconStatusNode): LiveRecord {
  const metrics = node.metrics;
  return {
    cpu: { usage: metrics.cpuPercent },
    ram: { used: metrics.memoryUsedBytes },
    swap: { used: 0 },
    load: { load1: metrics.load1, load5: 0, load15: 0 },
    disk: { used: metrics.diskUsedBytes },
    network: {
      up: metrics.networkTxBytesPerSecond,
      down: metrics.networkRxBytesPerSecond,
      totalUp: metrics.networkTxBytesTotal,
      totalDown: metrics.networkRxBytesTotal,
    },
    connections: { tcp: 0, udp: 0 },
    uptime: metrics.uptimeSeconds,
    process: 0,
    message: node.status === "degraded" ? "degraded" : "",
    updated_at: node.updatedAt,
  };
}

export function toKomariLiveData(status: NodeBeaconStatusResponse): LiveDataResponse {
  return {
    status: "ok",
    data: {
      online: status.nodes.filter((node) => node.online).map((node) => node.id),
      data: Object.fromEntries(status.nodes.map((node) => [node.id, toKomariLiveRecord(node)])),
    },
  };
}

export function getNodeDetailPath(id: string): string {
  return `/nodes/${encodeURIComponent(id)}`;
}

export const NODE_DETAIL_METRICS = ["cpu", "memory", "disk", "network", "latency", "connections"] as const;
export type NodeDetailMetric = (typeof NODE_DETAIL_METRICS)[number];

export const NODE_DETAIL_RANGES = ["realtime", "1d", "7d", "30d"] as const;
export type NodeDetailRange = (typeof NODE_DETAIL_RANGES)[number];

export const NODE_DETAIL_LATENCY_VANTAGES = [
  "ping",
  "zhejiang_mobile",
  "zhejiang_unicom",
  "zhejiang_telecom",
] as const;
export type NodeDetailLatencyVantage = (typeof NODE_DETAIL_LATENCY_VANTAGES)[number];

export interface NodeBeaconDetailProfile {
  osName: string | null;
  osVersion: string | null;
  kernelVersion: string | null;
  arch: string | null;
  virtualization: string | null;
  cpuModel: string | null;
  logicalCpuCores: number | null;
}

export interface NodeBeaconDetailLive {
  cpuPercent: number | null;
  load1: number | null;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
  diskUsedBytes?: number | null;
  diskTotalBytes?: number | null;
  disks: Array<{ usedBytes: number | null; totalBytes: number | null; usedPercent: number | null }>;
  networkRxBytesPerSecond: number | null;
  networkTxBytesPerSecond: number | null;
  uptimeSeconds: number | null;
}

export interface NodeBeaconDetailResponse {
  generatedAt: string;
  node: { id: string; name: string; group: string; region: string; countryCode?: string; online: boolean };
  profile: NodeBeaconDetailProfile;
  live: NodeBeaconDetailLive;
}

export interface NodeBeaconDetailSeries {
  metric: NodeDetailMetric;
  key: string;
  unit: "percent" | "bytes" | "bytes_per_second" | "load" | "count" | "milliseconds";
  labels?: Record<string, string>;
  points: Array<[number, number | null]>;
}

export interface NodeBeaconDetailSeriesResponse {
  nodeId: string;
  series: NodeBeaconDetailSeries[];
}

export interface NodeBeaconLatencyStatsResponse {
  nodeId: string;
  vantage: string;
  vantageName: string;
  source: {
    provider: string;
    probeId: number;
    asn: string;
    city: string;
    measurementId: number;
  };
  intervalSeconds: number;
  type: "ICMP";
  latestMs: number | null;
  averageMs: number | null;
  packetLossPercent: number | null;
  sampleCount: number;
  validSampleCount: number;
  packetsSent: number;
  packetsReceived: number;
}

export function isNodeDetailMetric(value: string): value is NodeDetailMetric {
  return (NODE_DETAIL_METRICS as readonly string[]).includes(value);
}

export function isNodeDetailRange(value: string): value is NodeDetailRange {
  return (NODE_DETAIL_RANGES as readonly string[]).includes(value);
}

export function isNodeDetailLatencyVantage(value: string): value is NodeDetailLatencyVantage {
  return (NODE_DETAIL_LATENCY_VANTAGES as readonly string[]).includes(value);
}

export function buildPublicNodeSeriesPath(
  id: string,
  options: { metrics: readonly string[]; range: string; aggregation?: string },
): string | null {
  const metrics = [...new Set(options.metrics.filter(isNodeDetailMetric))];
  if (!id || metrics.length === 0) return null;
  const range = isNodeDetailRange(options.range) ? options.range : "1d";
  const params = new URLSearchParams({
    metrics: metrics.join(","),
    range,
    aggregation: options.aggregation ?? "avg",
  });
  return `/api/public/nodes/${encodeURIComponent(id)}/series?${params.toString()}`;
}

export function buildPublicNodeLatencyStatsPath(id: string, vantage: string): string | null {
  if (!id || !isNodeDetailLatencyVantage(vantage)) return null;
  return `/api/public/nodes/${encodeURIComponent(id)}/latency-stats?vantage=${encodeURIComponent(vantage)}`;
}
