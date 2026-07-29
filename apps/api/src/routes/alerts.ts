import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  buildApiError,
  type AdminAlertsResponse,
  type AdminIncidentsResponse,
  type ApiIncidentsResponse,
  type IncidentStatus
} from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";
import { AlertmanagerError, type AlertmanagerService } from "../services/alertmanagerService.js";
import type { IncidentService, IncomingIncidentAlert } from "../services/incidentService.js";
import { alertmanagerWebhookRequestsTotal } from "../observability/metrics.js";
import type { SqliteDatabase } from "../services/database.js";
import { createNotificationService } from "../services/notificationService.js";

interface AlertmanagerWebhookBody {
  status?: string;
  alerts?: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item)]));
}

function safeTokenEqual(actual: string | undefined, expected: string): boolean {
  if (!actual) return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function readBearer(header: string | string[] | undefined): string | undefined {
  if (typeof header !== "string") return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1];
}

function normalizeWebhook(body: unknown): IncomingIncidentAlert[] {
  if (!isRecord(body)) throw new Error("Webhook body must be an object.");
  const payload = body as AlertmanagerWebhookBody;
  if (!Array.isArray(payload.alerts)) throw new Error("Webhook alerts must be an array.");

  return payload.alerts.map((raw, index) => {
    if (!isRecord(raw)) throw new Error(`alerts[${index}] must be an object.`);
    const status = (raw.status ?? payload.status) as string | undefined;
    if (status !== "firing" && status !== "resolved") {
      throw new Error(`alerts[${index}].status must be firing or resolved.`);
    }
    const fingerprint = typeof raw.fingerprint === "string" ? raw.fingerprint.trim() : "";
    const startsAt = typeof raw.startsAt === "string" ? raw.startsAt : "";
    if (!fingerprint || !startsAt) throw new Error(`alerts[${index}] requires fingerprint and startsAt.`);
    return {
      status: status as IncidentStatus,
      fingerprint,
      labels: stringRecord(raw.labels),
      annotations: stringRecord(raw.annotations),
      startsAt,
      endsAt: typeof raw.endsAt === "string" ? raw.endsAt : undefined,
      generatorUrl: typeof raw.generatorURL === "string" ? raw.generatorURL : undefined
    };
  });
}

export async function registerAlertRoutes(
  app: FastifyInstance,
  env: ApiEnv,
  alertmanagerService: AlertmanagerService,
  incidentService: IncidentService,
  database?: SqliteDatabase
): Promise<void> {
  const ownerOnly = { preHandler: app.requireOwner };

  app.get("/api/admin/alerts", ownerOnly, async (request, reply): Promise<AdminAlertsResponse | void> => {
    try {
      return await alertmanagerService.getActiveAlerts();
    } catch (error) {
      request.log.warn({ error }, "failed to load Alertmanager alerts");
      const message = error instanceof AlertmanagerError ? error.message : "Alertmanager is unavailable.";
      return reply.code(503).send(buildApiError("alertmanager_unavailable", message));
    }
  });

  app.get<{ Querystring: { limit?: string; nodeId?: string } }>(
    "/api/admin/incidents",
    ownerOnly,
    async (request): Promise<AdminIncidentsResponse> => {
      const limit = Number.parseInt(request.query.limit ?? "100", 10);
      return {
        incidents: incidentService.list(Number.isFinite(limit) ? limit : 100, request.query.nodeId?.trim() || undefined)
      };
    }
  );

  app.get<{ Querystring: { limit?: string; nodeId?: string } }>(
    "/api/incidents",
    async (request): Promise<ApiIncidentsResponse> => {
      const limit = Number.parseInt(request.query.limit ?? "20", 10);
      return {
        incidents: incidentService.listPublic(Number.isFinite(limit) ? limit : 20, request.query.nodeId?.trim() || undefined)
      };
    }
  );

  app.post("/api/webhooks/alertmanager", async (request, reply) => {
    if (!env.alertmanagerWebhookToken) {
      alertmanagerWebhookRequestsTotal.inc({ outcome: "not_configured" });
      return reply.code(503).send(buildApiError("webhook_not_configured", "Alertmanager webhook is not configured."));
    }
    const token = readBearer(request.headers.authorization) ??
      (typeof request.headers["x-nodebeacon-webhook-token"] === "string"
        ? request.headers["x-nodebeacon-webhook-token"]
        : undefined);
    if (!safeTokenEqual(token, env.alertmanagerWebhookToken)) {
      alertmanagerWebhookRequestsTotal.inc({ outcome: "invalid_auth" });
      request.log.warn("rejected Alertmanager webhook with invalid token");
      return reply.code(401).send(buildApiError("invalid_webhook_token", "Invalid webhook token."));
    }

    let alerts: IncomingIncidentAlert[];
    try {
      alerts = normalizeWebhook(request.body);
    } catch (error) {
      alertmanagerWebhookRequestsTotal.inc({ outcome: "invalid_payload" });
      return reply.code(400).send(buildApiError(
        "invalid_webhook_payload",
        error instanceof Error ? error.message : "Invalid Alertmanager webhook payload."
      ));
    }

    try {
      const processed = incidentService.record(alerts);
      if (database) {
        const notification = createNotificationService(database, env);
        for (const alert of alerts) notification.enqueue(`incident:${alert.fingerprint}:${alert.status}`, alert);
      }
      alertmanagerWebhookRequestsTotal.inc({ outcome: "success" });
      return reply.send({ status: "ok", processed });
    } catch (error) {
      alertmanagerWebhookRequestsTotal.inc({ outcome: "error" });
      request.log.error({ error }, "failed to persist Alertmanager webhook");
      return reply.code(500).send(buildApiError("webhook_persistence_failed", "Failed to persist Alertmanager webhook."));
    }
  });
}
