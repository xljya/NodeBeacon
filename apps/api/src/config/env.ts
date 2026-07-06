export interface ApiEnv {
  host: string;
  port: number;
  webOrigin: string;
  nodeConfigPath?: string;
  prometheusUrl?: string;
  prometheusTimeoutMs: number;
  prometheusBasicAuthUsername?: string;
  prometheusBasicAuthPassword?: string;
  prometheusBearerToken?: string;
  statusCacheTtlSeconds: number;
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function loadEnv(): ApiEnv {
  const prometheusUrl = process.env.PROMETHEUS_URL?.trim();
  const prometheusBasicAuthUsername = process.env.PROMETHEUS_BASIC_AUTH_USERNAME?.trim();
  const prometheusBasicAuthPassword = process.env.PROMETHEUS_BASIC_AUTH_PASSWORD?.trim();
  const prometheusBearerToken = process.env.PROMETHEUS_BEARER_TOKEN?.trim();

  return {
    host: process.env.API_HOST ?? "0.0.0.0",
    port: numberFromEnv("API_PORT", 3001),
    webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    nodeConfigPath: process.env.NODEBEACON_NODE_CONFIG,
    prometheusUrl: prometheusUrl || undefined,
    prometheusTimeoutMs: numberFromEnv("PROMETHEUS_TIMEOUT_MS", 5000),
    prometheusBasicAuthUsername: prometheusBasicAuthUsername || undefined,
    prometheusBasicAuthPassword: prometheusBasicAuthPassword || undefined,
    prometheusBearerToken: prometheusBearerToken || undefined,
    statusCacheTtlSeconds: numberFromEnv("STATUS_CACHE_TTL_SECONDS", 30)
  };
}
