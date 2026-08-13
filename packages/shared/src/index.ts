export type NodeHealthStatus = "online" | "offline" | "degraded" | "unknown";

export interface NodeConfigEntry {
  id: string;
  name: string;
  provider: string;
  group: string;
  region: string;
  /** ISO 3166-1 alpha-2 country code used for the node flag. */
  countryCode?: string;
  location?: string;
  displayOrder: number;
  public: boolean;
  labels: Record<string, string>;
  tags: string[];
  /** Optional owner-only display metadata used by the admin console. */
  ipAddress?: string;
  clientVersion?: string;
  privateNotes?: string;
  billing?: NodeBilling;
  /** Optional data/display policy for the V2 node detail page. */
  detail?: NodeDetailConfig;
}

export type NodeDetailVisibility = "safe" | "full" | "authenticated";

export interface NodeDetailProfileOverride {
  cpuModel?: string;
  physicalCpuCores?: number;
  virtualization?: string;
  gpuModel?: string;
}

export interface NodeDetailConfig {
  enabled?: boolean;
  visibility?: NodeDetailVisibility;
  /** Explicit physical devices prevent bridge/veth traffic double counting. */
  networkDevices?: string[];
  /** Real mountpoints to show; the server still applies filesystem excludes. */
  diskMounts?: string[];
  profileOverride?: NodeDetailProfileOverride;
  latencyVantages?: string[];
}

export interface NodeBilling {
  price?: number;
  currency?: string;
  cycleDays?: number;
  expiresAt?: string;
  autoRenewal?: boolean;
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
  /** Bytes received on physical interfaces since the current host boot. */
  networkRxBytesTotal: number;
  /** Bytes transmitted on physical interfaces since the current host boot. */
  networkTxBytesTotal: number;
}

/** Public status payload. Registry selectors and owner-only metadata never belong here. */
export interface PublicStatusNode {
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
  status: NodeHealthStatus;
  os: {
    name: string;
    arch: string;
  };
  metrics: StatusMetricSet;
  updatedAt: string;
}

/** Internal/authenticated status payload used by API services and owner routes. */
export interface StatusNode extends PublicStatusNode {
  labels: Record<string, string>;
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
  nodes: PublicStatusNode[];
}

export const APPEARANCE_MODES = ["system", "light", "dark"] as const;
export const APPEARANCE_ACCENTS = ["iris", "blue", "teal", "orange"] as const;
export const APPEARANCE_GRAYS = ["slate", "gray", "sand"] as const;
export const APPEARANCE_RADII = ["none", "small", "medium", "large", "full"] as const;
export const APPEARANCE_SCALINGS = ["90%", "95%", "100%", "105%", "110%"] as const;
export const APPEARANCE_PANELS = ["solid", "translucent"] as const;

export type AppearanceMode = (typeof APPEARANCE_MODES)[number];
export type AppearanceAccent = (typeof APPEARANCE_ACCENTS)[number];
export type AppearanceGray = (typeof APPEARANCE_GRAYS)[number];
export type AppearanceRadius = (typeof APPEARANCE_RADII)[number];
export type AppearanceScaling = (typeof APPEARANCE_SCALINGS)[number];
export type AppearancePanel = (typeof APPEARANCE_PANELS)[number];

/** Versioned, executable-code-free site appearance contract. */
export interface AppearanceTokensV1 {
  version: 1;
  mode: AppearanceMode;
  accent: AppearanceAccent;
  grayColor: AppearanceGray;
  radius: AppearanceRadius;
  scaling: AppearanceScaling;
  panelBackground: AppearancePanel;
}

export interface PublicThemePreset {
  id: string;
  name: string;
  tokens: AppearanceTokensV1;
  isDefault: boolean;
}

export interface ApiSiteConfigResponse {
  site: {
    name: string;
    description: string;
    defaultLocale: "en" | "zh-CN" | "zh-TW";
    timezone: string;
  };
  theme: PublicThemePreset;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// --- Node list / detail / trend endpoints (P2) ---

/** Public node metadata (no Prometheus label mapping — that stays server-side). */
export interface NodeMeta {
  id: string;
  name: string;
  provider: string;
  group: string;
  region: string;
  countryCode?: string;
  location?: string;
  displayOrder: number;
  tags: string[];
  online: boolean;
  status: NodeHealthStatus;
  updatedAt: string;
}

export interface ApiNodesResponse {
  generatedAt: string;
  nodes: NodeMeta[];
}

export interface ApiNodeDetailResponse {
  generatedAt: string;
  node: StatusNode;
}

/** Whitelisted trend metrics — the API rejects anything else. */
export const TREND_METRICS = ["cpu", "memory", "disk", "network", "load"] as const;
export type TrendMetric = (typeof TREND_METRICS)[number];

/** Whitelisted trend ranges — each maps to a fixed step server-side. */
export const TREND_RANGES = ["1h", "4h", "24h", "7d"] as const;
export type TrendRange = (typeof TREND_RANGES)[number];

export type TrendUnit = "percent" | "bytes" | "bytes_per_second" | "load" | "count" | "milliseconds";

export interface TrendSeries {
  /** "value" for single-series metrics; "rx" / "tx" for network. */
  name: string;
  /** [unix seconds, value]; null where Prometheus had no sample. */
  points: Array<[number, number | null]>;
}

export interface ApiNodeRangeResponse {
  nodeId: string;
  metric: TrendMetric;
  range: TrendRange;
  stepSeconds: number;
  unit: TrendUnit;
  generatedAt: string;
  series: TrendSeries[];
}

// --- Node detail V2 ---

export const DETAIL_CHART_METRICS = [
  "cpu",
  "memory",
  "swap",
  "disk",
  "network",
  "latency",
  "connections"
] as const;
export type DetailChartMetric = (typeof DETAIL_CHART_METRICS)[number];

export const DETAIL_TIME_RANGES = ["realtime", "1d", "7d", "30d", "60d", "custom"] as const;
export type DetailTimeRange = (typeof DETAIL_TIME_RANGES)[number];

export const DETAIL_AGGREGATIONS = [
  "avg",
  "min",
  "max",
  "first",
  "last",
  "stddev",
  "p70",
  "p95",
  "p99"
] as const;
export type DetailAggregation = (typeof DETAIL_AGGREGATIONS)[number];

export type DetailUnit = "percent" | "bytes" | "bytes_per_second" | "load" | "count" | "milliseconds";

export interface NodeDetailCapabilities {
  realtime: boolean;
  cpuModel: boolean;
  gpu: boolean;
  swap: boolean;
  multiDisk: boolean;
  processTotal: boolean;
  latency: boolean;
}

export interface NodeDetailSystemProfile {
  osName: string | null;
  osVersion: string | null;
  kernelVersion: string | null;
  arch: string | null;
  virtualization: string | null;
  cpuModel: string | null;
  logicalCpuCores: number | null;
  physicalCpuCores: number | null;
  gpuModel: string | null;
}

export interface NodeDetailDiskMetric {
  id: string;
  label: string;
  mountpoint?: string;
  usedBytes: number | null;
  totalBytes: number | null;
  usedPercent: number | null;
}

export interface NodeDetailLiveMetrics {
  cpuPercent: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
  memoryUsedBytes: number | null;
  memoryTotalBytes: number | null;
  swapUsedBytes: number | null;
  swapTotalBytes: number | null;
  disks: NodeDetailDiskMetric[];
  networkRxBytesPerSecond: number | null;
  networkTxBytesPerSecond: number | null;
  networkRxBytesTotal: number | null;
  networkTxBytesTotal: number | null;
  tcpConnections: number | null;
  udpConnections: number | null;
  processRunning: number | null;
  processBlocked: number | null;
  processTotal: number | null;
  uptimeSeconds: number | null;
  lastReportAt: string | null;
}

export interface ApiNodeDetailV2Response {
  generatedAt: string;
  node: NodeMeta;
  profile: NodeDetailSystemProfile;
  capabilities: NodeDetailCapabilities;
  live: NodeDetailLiveMetrics;
}

export interface NodeDetailSeries {
  metric: DetailChartMetric;
  key: string;
  unit: DetailUnit;
  labels?: Record<string, string>;
  points: Array<[number, number | null]>;
}

export interface ApiNodeDetailSeriesResponse {
  nodeId: string;
  from: string;
  to: string;
  dataFrom: string | null;
  dataTo: string | null;
  stepSeconds: number;
  aggregation: DetailAggregation;
  series: NodeDetailSeries[];
}

export interface ApiNodeLatencyStatsResponse {
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
  windowSeconds: number;
  intervalSeconds: number;
  type: "ICMP";
  measuredFrom: string | null;
  measuredTo: string | null;
  updatedAt: string | null;
  packetLossPercent: number | null;
  minimumMs: number | null;
  maximumMs: number | null;
  averageMs: number | null;
  latestMs: number | null;
  p50Ms: number | null;
  p99Ms: number | null;
  standardDeviationMs: number | null;
  jitterMs: number | null;
  sampleCount: number;
  validSampleCount: number;
  packetsSent: number;
  packetsReceived: number;
}

// --- Blackbox probe latency (public) ---

/** One blackbox-exporter HTTP target, keyed by its probe URL. */
export interface ProbeResult {
  /** The probed URL (Prometheus `instance` label). */
  target: string;
  success: boolean;
  latencySeconds: number | null;
  httpStatusCode: number | null;
  /** avg_over_time(probe_success[24h]), 0..1. */
  successRate24h: number | null;
  /** TLS cert expiry (ISO timestamp) when the target is HTTPS. */
  sslExpiresAt: string | null;
}

export interface ApiLatencyResponse {
  generatedAt: string;
  cache: {
    ttlSeconds: number;
    stale: boolean;
  };
  probes: ProbeResult[];
}

// --- Auth & admin (owner-only, read-only in this iteration) ---

export type UserRole = "owner" | "viewer";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SecondFactorRequest {
  code: string;
}

export interface AuthResponse {
  user: AuthUser;
}

/** Public session probe; signed-out visitors receive HTTP 200 with a null user. */
export interface AuthSessionResponse {
  user: AuthUser | null;
}

export interface SecondFactorRequiredResponse {
  status: "second_factor_required";
  methods: ["totp", "recovery_code"];
}

export interface AuthChallengeResponse {
  required: boolean;
}

export interface AdminAccountResponse {
  user: AuthUser | null;
  passwordLoginEnabled: boolean;
  githubLoginEnabled: boolean;
  totpEnabled: boolean;
  recoveryCodesRemaining: number;
}

export interface TotpSetupResponse {
  secret: string;
  otpauthUri: string;
}

export interface TotpConfirmationResponse {
  status: "ok";
  recoveryCodes: string[];
}

export interface RecoveryCodesResponse {
  status: "ok";
  recoveryCodes: string[];
}

/** Public: tells the login page which sign-in methods are enabled. */
export interface AuthConfigResponse {
  passwordLoginEnabled: boolean;
  githubLoginEnabled: boolean;
}

export interface AdminSummaryResponse {
  generatedAt: string;
  version: string;
  prometheus: {
    configured: boolean;
    /** Host only (never credentials) so the owner can confirm the target. */
    host?: string;
    reachable: boolean;
  };
  cache: {
    ttlSeconds: number;
    stale: boolean;
  };
  nodes: {
    total: number;
    online: number;
    degraded: number;
    offline: number;
  };
  auth: {
    allowRegister: boolean;
    ownerConfigured: boolean;
  };
}

/** A node as seen in the admin console: registry metadata + current health. */
export interface AdminNode {
  id: string;
  name: string;
  provider: string;
  group: string;
  region: string;
  countryCode?: string;
  location?: string;
  displayOrder: number;
  public: boolean;
  labels: Record<string, string>;
  tags: string[];
  ipAddress?: string;
  clientVersion?: string;
  privateNotes?: string;
  billing?: NodeBilling;
  detail?: NodeDetailConfig;
  online: boolean;
  status: NodeHealthStatus;
  updatedAt: string;
}

export interface AdminNodesResponse {
  nodes: AdminNode[];
}

export type AdminNodeMutation = Partial<Omit<NodeConfigEntry, "id">> & {
  id?: string;
};

export interface AdminNodeResponse {
  node: AdminNode;
}

/** Full desired display order: must list every node id exactly once. */
export interface AdminNodeOrderRequest {
  ids: string[];
}

export interface AdminUsersResponse {
  users: AuthUser[];
}

export interface AdminSession {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  ipAddress?: string;
  userAgent?: string;
  current: boolean;
}

export interface AdminSessionsResponse {
  sessions: AdminSession[];
}

export interface AdminAuditEvent {
  id: number;
  timestamp: string;
  actor: string;
  action: string;
  entityId?: string;
  payload?: unknown;
}

export interface AdminAuditEventsResponse {
  events: AdminAuditEvent[];
}

export interface AdminAlert {
  fingerprint: string;
  state: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt: string;
  updatedAt?: string;
  generatorUrl?: string;
}

export interface AdminAlertsResponse {
  configured: boolean;
  generatedAt: string;
  alerts: AdminAlert[];
}

export type IncidentStatus = "firing" | "resolved";

export interface IncidentSummary {
  id: number;
  fingerprint: string;
  alertName: string;
  status: IncidentStatus;
  startedAt: string;
  resolvedAt?: string;
  updatedAt: string;
  severity?: string;
  nodeId?: string;
  summary?: string;
  description?: string;
}

export interface AdminIncident extends IncidentSummary {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  generatorUrl?: string;
}

export interface ApiIncidentsResponse {
  incidents: IncidentSummary[];
}

export interface AdminIncidentsResponse {
  incidents: AdminIncident[];
}

const gib = 1024 ** 3;
const mib = 1024 ** 2;

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
      countryCode: "US",
      location: "United States",
      displayOrder: 10,
      public: true,
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
        networkTxBytesPerSecond: 4200,
        networkRxBytesTotal: 420 * mib,
        networkTxBytesTotal: 310 * mib
      },
      updatedAt: "2026-07-03T08:30:00.000Z"
    },
    {
      id: "dmit-uswest",
      name: "dmit-uswest",
      provider: "DMIT",
      group: "Edge",
      region: "US",
      countryCode: "US",
      location: "US West",
      displayOrder: 20,
      public: true,
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
        networkTxBytesPerSecond: 8700,
        networkRxBytesTotal: 550 * mib,
        networkTxBytesTotal: 430 * mib
      },
      updatedAt: "2026-07-03T08:30:00.000Z"
    },
    {
      id: "hostbrr-4t",
      name: "hostbrr-4t",
      provider: "HostBrr",
      group: "Storage",
      region: "EU",
      countryCode: "DE",
      location: "Germany",
      displayOrder: 30,
      public: true,
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
        networkTxBytesPerSecond: 3100,
        networkRxBytesTotal: 320 * mib,
        networkTxBytesTotal: 290 * mib
      },
      updatedAt: "2026-07-03T08:30:00.000Z"
    },
    {
      id: "netcup-1o",
      name: "netcup-1o",
      provider: "netcup",
      group: "Compute",
      region: "EU",
      countryCode: "DE",
      location: "Germany",
      displayOrder: 40,
      public: true,
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
        networkTxBytesPerSecond: 5900,
        networkRxBytesTotal: 260 * mib,
        networkTxBytesTotal: 270 * mib
      },
      updatedAt: "2026-07-03T08:30:00.000Z"
    },
    {
      id: "huawei-2c1g",
      name: "huawei-2c1g",
      provider: "Huawei Cloud",
      group: "CN",
      region: "CN",
      countryCode: "CN",
      location: "China",
      displayOrder: 50,
      public: true,
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
        networkTxBytesPerSecond: 1900,
        networkRxBytesTotal: 190 * mib,
        networkTxBytesTotal: 200 * mib
      },
      updatedAt: "2026-07-03T08:30:00.000Z"
    }
  ]
};

export function buildSummary(nodes: PublicStatusNode[]): StatusSummary {
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
