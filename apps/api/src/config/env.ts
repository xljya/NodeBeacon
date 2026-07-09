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
  /** Prometheus job label of the blackbox HTTP probes ("" disables /api/latency). */
  probeJob: string;
  // Auth (owner from env; stateless signed-cookie sessions).
  cookieSecret: string;
  secureCookie: boolean;
  sessionTtlSeconds: number;
  allowRegister: boolean;
  initialOwnerEmail?: string;
  initialOwnerPassword?: string;
  // GitHub OAuth login. Only the account whose login === githubOwnerLogin is
  // accepted as owner; everyone else is rejected.
  githubClientId?: string;
  githubClientSecret?: string;
  githubOwnerLogin?: string;
  githubCallbackUrl?: string;
  publicBaseUrl?: string;
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolFromEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "true" || raw === "1" || raw === "yes";
}

export function loadEnv(): ApiEnv {
  const prometheusUrl = process.env.PROMETHEUS_URL?.trim();
  const prometheusBasicAuthUsername = process.env.PROMETHEUS_BASIC_AUTH_USERNAME?.trim();
  const prometheusBasicAuthPassword = process.env.PROMETHEUS_BASIC_AUTH_PASSWORD?.trim();
  const prometheusBearerToken = process.env.PROMETHEUS_BEARER_TOKEN?.trim();
  const cookieSecret = process.env.COOKIE_SECRET?.trim();
  const initialOwnerEmail = process.env.INITIAL_OWNER_EMAIL?.trim();
  const initialOwnerPassword = process.env.INITIAL_OWNER_PASSWORD;
  const githubClientId = process.env.GITHUB_CLIENT_ID?.trim();
  const githubClientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  const githubOwnerLogin = process.env.GITHUB_OWNER_LOGIN?.trim();
  const githubCallbackUrl = process.env.GITHUB_CALLBACK_URL?.trim();
  const publicBaseUrl = process.env.PUBLIC_BASE_URL?.trim();

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
    statusCacheTtlSeconds: numberFromEnv("STATUS_CACHE_TTL_SECONDS", 30),
    probeJob: process.env.PROBE_JOB?.trim() ?? "blackbox-http-public",
    // A dev-only fallback keeps local `pnpm dev` working without a .env; in
    // production COOKIE_SECRET must be set (see the k8s Secret).
    cookieSecret: cookieSecret || "nodebeacon-dev-insecure-cookie-secret-change-me",
    secureCookie: (process.env.NODE_ENV ?? "development") === "production",
    sessionTtlSeconds: numberFromEnv("SESSION_TTL_SECONDS", 7 * 24 * 60 * 60),
    allowRegister: boolFromEnv("ALLOW_REGISTER", false),
    initialOwnerEmail: initialOwnerEmail || undefined,
    initialOwnerPassword: initialOwnerPassword || undefined,
    githubClientId: githubClientId || undefined,
    githubClientSecret: githubClientSecret || undefined,
    githubOwnerLogin: githubOwnerLogin || undefined,
    githubCallbackUrl: githubCallbackUrl || undefined,
    publicBaseUrl: publicBaseUrl || undefined
  };
}
