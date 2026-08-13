/**
 * Versioned NodeBeacon Admin frontend contract copy.
 * Source of truth: xljya/NodeBeacon packages/shared. Keep this file aligned
 * with the pinned product repository commit; API integration tests in that
 * repository prevent drift.
 */
export const ADMIN_CONTRACT_VERSION = "1.1.2";

export type NodeHealthStatus = "online" | "offline" | "degraded" | "unknown";

export interface AppearanceTokensV1 {
  version: 1;
  mode: "system" | "light" | "dark";
  accent: "iris" | "blue" | "teal" | "orange";
  grayColor: "slate" | "gray" | "sand";
  radius: "none" | "small" | "medium" | "large" | "full";
  scaling: "90%" | "95%" | "100%" | "105%" | "110%";
  panelBackground: "solid" | "translucent";
}

export const APPEARANCE_MODES = ["system", "light", "dark"] as const;
export const APPEARANCE_ACCENTS = ["iris", "blue", "teal", "orange"] as const;
export const APPEARANCE_GRAYS = ["slate", "gray", "sand"] as const;
export const APPEARANCE_RADII = ["none", "small", "medium", "large", "full"] as const;
export const APPEARANCE_SCALINGS = ["90%", "95%", "100%", "105%", "110%"] as const;
export const APPEARANCE_PANELS = ["solid", "translucent"] as const;

export interface AuthUser {
  id: string;
  email: string;
  role: "owner" | "viewer";
}

export interface AuthSessionResponse {
  user: AuthUser | null;
}

export interface AuthConfigResponse {
  passwordLoginEnabled: boolean;
  githubLoginEnabled: boolean;
}

export interface AuthResponse {
  user: AuthUser;
}

export interface SecondFactorRequiredResponse {
  status: "second_factor_required";
  methods: ["totp", "recovery_code"];
}

export interface AdminSummaryResponse {
  generatedAt: string;
  version: string;
  prometheus: { configured: boolean; host?: string; reachable: boolean };
  cache: { ttlSeconds: number; stale: boolean };
  nodes: { total: number; online: number; degraded: number; offline: number };
  auth: { allowRegister: boolean; ownerConfigured: boolean };
}

export interface NodeBilling {
  price?: number;
  currency?: string;
  cycleDays?: number;
  expiresAt?: string;
  autoRenewal?: boolean;
}

export interface NodeDetailConfig {
  enabled?: boolean;
  visibility?: "safe" | "full" | "authenticated";
  networkDevices?: string[];
  diskMounts?: string[];
  profileOverride?: {
    cpuModel?: string;
    physicalCpuCores?: number;
    virtualization?: string;
    gpuModel?: string;
  };
  latencyVantages?: string[];
}

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

export type AdminNodeMutation = Partial<Omit<AdminNode, "online" | "status" | "updatedAt">> & {
  id?: string;
};

export interface SiteSettings {
  name: string;
  description: string;
  defaultLocale: "en" | "zh-CN" | "zh-TW";
  timezone: string;
}

export interface GeneralSettings {
  statusCacheTtlSeconds: number;
  incidentRetentionDays: number;
  auditRetentionDays: number;
  executionRetentionDays: number;
}

export interface PublicThemePreset {
  id: string;
  name: string;
  tokens: AppearanceTokensV1;
  isDefault: boolean;
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

export interface NotificationChannel {
  id: string;
  name: string;
  type: "telegram" | "smtp" | "webhook";
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AlertRule {
  id: string;
  type: "offline" | "load";
  name: string;
  nodeId?: string;
  config: Record<string, unknown>;
  channelIds: string[];
  enabled: boolean;
  reconcileStatus: string;
  reconcileError?: string;
}

export interface TrafficReport {
  id: string;
  name: string;
  period: "daily" | "weekly" | "monthly";
  time: string;
  timezone: string;
  nodeIds: string[];
  channelIds: string[];
  enabled: boolean;
}

export type AdminProbeSource = "manual" | "china_isp";

export interface AdminProbe {
  id: string;
  name: string;
  protocol: "http" | "tcp" | "icmp";
  target: string;
  intervalSeconds: number;
  enabled: boolean | number;
  source?: AdminProbeSource;
  updatedAt: number;
}

export type ChinaIspIpFamily = "v4" | "v6";

export interface ChinaIspPingCatalog {
  domain: string;
  port: number;
  vantage: "rs1000-blackbox";
  maxTargetsPerFamily: number;
  defaultProvinceCodes: string[];
  provinces: Array<{ code: string; name: string }>;
  carriers: Array<{ code: string; name: string }>;
  ipFamilies: ChinaIspIpFamily[];
}

export interface ChinaIspPingBatchResponse {
  created: number;
  skipped: number;
  total: number;
  reconciled: boolean;
}

export interface ChinaIspPingBatchDeleteResponse {
  deleted: number;
  reconciled: boolean;
}

export interface ProbeReconcileResponse {
  reconciled: boolean;
}

export interface AdminProbeResult extends ProbeResult {
  job: string;
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

export interface AdminAuditEvent {
  id: number;
  timestamp: string;
  actor: string;
  action: string;
  entityId?: string;
  payload?: unknown;
}

export interface AdminAlert {
  fingerprint: string;
  state: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt: string;
}

export interface AdminIncident {
  id: number;
  fingerprint: string;
  alertName: string;
  status: "firing" | "resolved";
  startedAt: string;
  resolvedAt?: string;
  summary?: string;
}

export interface AdminLogEntry {
  timestamp: string;
  labels: Record<string, string>;
  line: string;
}

export interface AdminBackupStatus {
  request: unknown;
  lastResult: unknown;
  lastSuccess: string | null;
}

export interface AdminDataSource {
  id: string;
  configured: boolean;
  reachable: boolean;
  host?: string;
  bytes?: number;
}

export interface RemoteTask {
  id: string;
  label: string;
  risk: string;
}

export interface RemoteTarget {
  id: string;
  nodeId: string;
  hostname: string;
  port: number;
  enabled: boolean | number;
  updatedAt: number;
}

export interface RemoteRun {
  id: string;
  targetId: string;
  taskId: string;
  status: string;
  summary: string;
  startedAt: number;
  actor: string;
}

export interface NotificationDelivery {
  id: number;
  channelId: string;
  eventType: string;
  status: string;
  attempts: number;
  lastError?: string | null;
  createdAt: number;
}

export interface ProbeResult {
  target: string;
  success: boolean;
  latencySeconds: number | null;
  httpStatusCode: number | null;
  successRate24h: number | null;
}
