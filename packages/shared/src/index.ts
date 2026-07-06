export type NodeHealthStatus = "online" | "offline" | "degraded" | "unknown";

export interface NodeConfigEntry {
  id: string;
  name: string;
  provider: string;
  group: string;
  region: string;
  location?: string;
  displayOrder: number;
  public: boolean;
  labels: Record<string, string>;
  tags: string[];
}

export interface StatusMetricSet {
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
}

export interface StatusNode {
  id: string;
  name: string;
  provider: string;
  group: string;
  region: string;
  location?: string;
  displayOrder: number;
  public: boolean;
  labels: Record<string, string>;
  tags: string[];
  online: boolean;
  status: NodeHealthStatus;
  os: {
    name: string;
    arch: string;
  };
  metrics: StatusMetricSet;
  updatedAt: string;
}

export interface StatusGroupSummary {
  group: string;
  total: number;
  online: number;
}

export interface StatusSummary {
  total: number;
  online: number;
  degraded: number;
  offline: number;
  regions: number;
  groups: StatusGroupSummary[];
}

export interface ApiStatusResponse {
  generatedAt: string;
  cache: {
    ttlSeconds: number;
    stale: boolean;
  };
  summary: StatusSummary;
  nodes: StatusNode[];
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

const gib = 1024 ** 3;

export const statusFixture: ApiStatusResponse = {
  generatedAt: "2026-07-03T08:30:00.000Z",
  cache: {
    ttlSeconds: 30,
    stale: false
  },
  summary: {
    total: 5,
    online: 5,
    degraded: 0,
    offline: 0,
    regions: 3,
    groups: [
      { group: "Core", total: 1, online: 1 },
      { group: "Edge", total: 1, online: 1 },
      { group: "Storage", total: 1, online: 1 },
      { group: "Compute", total: 1, online: 1 },
      { group: "CN", total: 1, online: 1 }
    ]
  },
  nodes: [
    {
      id: "rs1000",
      name: "RS1000",
      provider: "netcup",
      group: "Core",
      region: "EU",
      location: "Germany",
      displayOrder: 10,
      public: true,
      labels: { job: "node-exporter", instance: "10.77.0.1:9100" },
      tags: ["k3s", "prometheus"],
      online: true,
      status: "online",
      os: { name: "Debian", arch: "amd64" },
      metrics: {
        cpuPercent: 11.8,
        memoryPercent: 42.4,
        memoryUsedBytes: 3.4 * gib,
        memoryTotalBytes: 8 * gib,
        diskPercent: 31.6,
        diskUsedBytes: 25.3 * gib,
        diskTotalBytes: 80 * gib,
        load1: 0.38,
        uptimeSeconds: 188 * 24 * 60 * 60 + 2 * 60 * 60,
        networkRxBytesPerSecond: 9500,
        networkTxBytesPerSecond: 4200
      },
      updatedAt: "2026-07-03T08:30:00.000Z"
    },
    {
      id: "dmit-uswest",
      name: "dmit-uswest",
      provider: "DMIT",
      group: "Edge",
      region: "US",
      location: "US West",
      displayOrder: 20,
      public: true,
      labels: { job: "node-exporter", instance: "10.77.0.2:9100" },
      tags: ["ingress", "public"],
      online: true,
      status: "online",
      os: { name: "Debian", arch: "amd64" },
      metrics: {
        cpuPercent: 18.2,
        memoryPercent: 56.7,
        memoryUsedBytes: 1.13 * gib,
        memoryTotalBytes: 2 * gib,
        diskPercent: 49.2,
        diskUsedBytes: 39.4 * gib,
        diskTotalBytes: 80 * gib,
        load1: 0.51,
        uptimeSeconds: 74 * 24 * 60 * 60 + 9 * 60 * 60,
        networkRxBytesPerSecond: 22100,
        networkTxBytesPerSecond: 8700
      },
      updatedAt: "2026-07-03T08:30:00.000Z"
    },
    {
      id: "hostbrr-4t",
      name: "hostbrr-4t",
      provider: "HostBrr",
      group: "Storage",
      region: "EU",
      location: "Germany",
      displayOrder: 30,
      public: true,
      labels: { job: "node-exporter", instance: "10.77.0.3:9100" },
      tags: ["storage"],
      online: true,
      status: "online",
      os: { name: "Debian", arch: "amd64" },
      metrics: {
        cpuPercent: 7.4,
        memoryPercent: 36.9,
        memoryUsedBytes: 2.95 * gib,
        memoryTotalBytes: 8 * gib,
        diskPercent: 63.8,
        diskUsedBytes: 2.55 * 1024 * gib,
        diskTotalBytes: 4 * 1024 * gib,
        load1: 0.21,
        uptimeSeconds: 121 * 24 * 60 * 60 + 14 * 60 * 60,
        networkRxBytesPerSecond: 6800,
        networkTxBytesPerSecond: 3100
      },
      updatedAt: "2026-07-03T08:30:00.000Z"
    },
    {
      id: "netcup-1o",
      name: "netcup-1o",
      provider: "netcup",
      group: "Compute",
      region: "EU",
      location: "Germany",
      displayOrder: 40,
      public: true,
      labels: { job: "node-exporter", instance: "10.77.0.4:9100" },
      tags: ["vps"],
      online: true,
      status: "online",
      os: { name: "Ubuntu", arch: "amd64" },
      metrics: {
        cpuPercent: 23.9,
        memoryPercent: 48.1,
        memoryUsedBytes: 1.92 * gib,
        memoryTotalBytes: 4 * gib,
        diskPercent: 42.5,
        diskUsedBytes: 34 * gib,
        diskTotalBytes: 80 * gib,
        load1: 0.63,
        uptimeSeconds: 33 * 24 * 60 * 60 + 3 * 60 * 60,
        networkRxBytesPerSecond: 14300,
        networkTxBytesPerSecond: 5900
      },
      updatedAt: "2026-07-03T08:30:00.000Z"
    },
    {
      id: "huawei-2c1g",
      name: "huawei-2c1g",
      provider: "Huawei Cloud",
      group: "CN",
      region: "CN",
      location: "China",
      displayOrder: 50,
      public: true,
      labels: { job: "node-exporter", instance: "10.77.0.5:9100" },
      tags: ["vps"],
      online: true,
      status: "online",
      os: { name: "EulerOS", arch: "amd64" },
      metrics: {
        cpuPercent: 15.1,
        memoryPercent: 61.2,
        memoryUsedBytes: 626 * 1024 * 1024,
        memoryTotalBytes: 1 * gib,
        diskPercent: 54.3,
        diskUsedBytes: 21.7 * gib,
        diskTotalBytes: 40 * gib,
        load1: 0.42,
        uptimeSeconds: 19 * 24 * 60 * 60 + 6 * 60 * 60,
        networkRxBytesPerSecond: 4800,
        networkTxBytesPerSecond: 1900
      },
      updatedAt: "2026-07-03T08:30:00.000Z"
    }
  ]
};

export function buildSummary(nodes: StatusNode[]): StatusSummary {
  const groups = new Map<string, StatusGroupSummary>();
  for (const node of nodes) {
    const current = groups.get(node.group) ?? { group: node.group, total: 0, online: 0 };
    current.total += 1;
    if (node.online) current.online += 1;
    groups.set(node.group, current);
  }

  return {
    total: nodes.length,
    online: nodes.filter((node) => node.online).length,
    degraded: nodes.filter((node) => node.status === "degraded").length,
    offline: nodes.filter((node) => node.status === "offline").length,
    regions: new Set(nodes.map((node) => node.region)).size,
    groups: [...groups.values()]
  };
}

export function buildApiError(code: string, message: string, details?: unknown): ApiErrorResponse {
  return { error: { code, message, details } };
}
