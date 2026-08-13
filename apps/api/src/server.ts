import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import { loadEnv } from "./config/env.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerStatusRoutes } from "./routes/status.js";
import { registerNodeRoutes } from "./routes/nodes.js";
import { registerLatencyRoutes } from "./routes/latency.js";
import { registerMetricsRoutes } from "./routes/metrics.js";
import {
  configureBackupSuccessTimestamp,
  httpRequestDurationSeconds,
  httpRequestsTotal
} from "./observability/metrics.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAuthGuard } from "./plugins/authGuard.js";
import { createAuthService } from "./services/authService.js";
import { openDatabase } from "./services/database.js";
import { createSessionService } from "./services/sessionService.js";
import { createAuthChallengeService } from "./services/authChallengeService.js";
import { createAuditService } from "./services/auditService.js";
import { createAlertmanagerService } from "./services/alertmanagerService.js";
import { createIncidentService } from "./services/incidentService.js";
import { registerAlertRoutes } from "./routes/alerts.js";
import { startRipeAtlasCollector } from "./services/ripeAtlasCollector.js";
import { createSettingsService } from "./services/settingsService.js";
import { migrateEncryptedSecrets } from "./services/secretService.js";
import { registerAdminFoundationRoutes } from "./routes/adminFoundation.js";
import { registerAdminNotificationRoutes } from "./routes/adminNotifications.js";
import { registerAdminProbeRoutes } from "./routes/adminProbes.js";
import { registerAdminRemoteRoutes } from "./routes/adminRemote.js";
import { reconcileManagedProbes } from "./services/k8sReconcileService.js";

const webDistPath = fileURLToPath(new URL("../../status-web/dist/", import.meta.url));

export function usesLegacyWebShell(rawUrl: string): boolean {
  const pathname = rawUrl.split("?", 1)[0] ?? "/";
  return pathname.startsWith("/nodes/") ||
    pathname === "/nodes" ||
    pathname.startsWith("/legacy/");
}

export function getLegacyAdminRedirect(rawUrl: string): string | null {
  const queryIndex = rawUrl.indexOf("?");
  const pathname = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : rawUrl.slice(queryIndex);

  if (pathname === "/login-v2") return `/login${query}`;
  if (pathname === "/admin-v2" || pathname.startsWith("/admin-v2/")) {
    return `/admin${pathname.slice("/admin-v2".length)}${query}`;
  }
  return null;
}

export async function createApp() {
  const env = loadEnv();
  if (process.env.NODE_ENV === "production" && !env.settingsEncryptionKey) {
    throw new Error("SETTINGS_ENCRYPTION_KEY must be configured in production.");
  }
  const app = fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info"
    }
  });

  await app.register(cors, {
    origin: env.webOrigin,
    credentials: true
  });

  // Cookie must be registered before the auth guard reads request.cookies.
  await app.register(cookie, { secret: env.cookieSecret });
  // global:false => only routes that opt in (login) are rate limited.
  await app.register(rateLimit, { global: false });
  await app.register(websocket);

  // API responses contain live operational or authenticated state. Make the
  // no-store boundary explicit at the origin so browsers, reverse proxies and
  // CDNs do not depend on extension/default-cache heuristics.
  app.addHook("onSend", async (request, reply, payload) => {
    if ((request.raw.url ?? "").startsWith("/api/")) {
      reply.header("cache-control", "no-store");
    }
    return payload;
  });

  const database = openDatabase(env.databasePath);
  const migratedSecrets = migrateEncryptedSecrets(env, database);
  if (migratedSecrets > 0) {
    app.log.info({ migratedSecrets }, "migrated encrypted settings to the independent settings key");
  }
  configureBackupSuccessTimestamp(env.backupSuccessTimestampPath);
  const authService = createAuthService(env, database);
  await authService.initialize();
  const settingsService = createSettingsService(database);
  const sessionService = createSessionService(database);
  const challengeService = createAuthChallengeService();
  const auditService = createAuditService(database);
  const alertmanagerService = createAlertmanagerService(env);
  const incidentService = createIncidentService(database);
  const DAY_MS = 24 * 60 * 60 * 1000;
  const pruneState = () => {
    const now = Date.now();
    const pruned = {
      incidents: incidentService.pruneResolvedBefore(now - env.incidentRetentionDays * DAY_MS),
      auditEvents: auditService.pruneBefore(now - env.auditRetentionDays * DAY_MS),
      sessions: sessionService.cleanupExpired(now, env.revokedSessionRetentionDays)
    };
    if (Object.values(pruned).some((count) => count > 0)) {
      app.log.info(pruned, "pruned expired persisted state");
    }
  };
  pruneState();
  const retentionTimer = setInterval(pruneState, 6 * 60 * 60 * 1000);
  retentionTimer.unref();
  const stopRipeAtlasCollector = startRipeAtlasCollector(env, app.log);
  registerAuthGuard(app, env, authService, sessionService);
  app.addHook("onClose", async () => {
    clearInterval(retentionTimer);
    stopRipeAtlasCollector();
    database.close();
  });

  // Own observability: request volume + duration by route pattern (bounded
  // cardinality — the pattern, e.g. "/api/nodes/:id", never the raw URL).
  app.addHook("onResponse", async (request, reply) => {
    const route = request.routeOptions?.url ?? "unmatched";
    const labels = { method: request.method, route };
    httpRequestsTotal.inc({ ...labels, status: String(reply.statusCode) });
    httpRequestDurationSeconds.observe(labels, reply.elapsedTime / 1000);
  });

  await registerHealthRoutes(app, {
    database,
    nodeConfigPath: env.nodeConfigPath,
    nodeConfigSeedPath: env.nodeConfigSeedPath
  });
  await registerStatusRoutes(app, env);
  await registerNodeRoutes(app, env);
  await registerLatencyRoutes(app, env);
  await registerMetricsRoutes(app);
  await registerAuthRoutes(app, env, authService, sessionService, auditService, challengeService);
  await registerAdminRoutes(app, env, authService, sessionService, auditService);
  await registerAdminFoundationRoutes(app, env, authService, auditService, settingsService, database);
  await registerAdminNotificationRoutes(app, env, database, auditService);
  await registerAdminProbeRoutes(app, env, database);
  void reconcileManagedProbes(database, app.log);
  await registerAdminRemoteRoutes(app, env, database, auditService, authService);
  await registerAlertRoutes(app, env, alertmanagerService, incidentService, database);

  if (existsSync(webDistPath)) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: "/"
    });

    app.setNotFoundHandler((request, reply) => {
      const url = request.raw.url ?? "";
      if (url.startsWith("/api/")) {
        return reply.code(404).send({ error: { code: "not_found", message: "API route not found." } });
      }
      const redirect = getLegacyAdminRedirect(url);
      if (redirect) {
        return reply.code(308).redirect(redirect);
      }
      return reply.sendFile(usesLegacyWebShell(url) ? "legacy/index.html" : "index.html");
    });
  }

  return { app, env };
}

async function start(): Promise<void> {
  const { app, env } = await createApp();
  try {
    await app.listen({ host: env.host, port: env.port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryUrl) {
  void start();
}
