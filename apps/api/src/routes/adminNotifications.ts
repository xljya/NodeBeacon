import type { FastifyInstance } from "fastify";
import { buildApiError } from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";
import type { AuditService } from "../services/auditService.js";
import type { SqliteDatabase } from "../services/database.js";
import { createNotificationService, type NotificationChannelType } from "../services/notificationService.js";

function record(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export async function registerAdminNotificationRoutes(app: FastifyInstance, env: ApiEnv, db: SqliteDatabase, audit: AuditService): Promise<void> {
  const service = createNotificationService(db, env); const owner = { preHandler: app.requireOwner };
  app.get("/api/admin/notification-channels", owner, async () => ({ channels: service.listChannels() }));
  app.post("/api/admin/notification-channels", owner, async (request, reply) => { try { const body = record(request.body); return service.saveChannel({ name: String(body.name ?? ""), type: String(body.type ?? "") as NotificationChannelType, config: record(body.config), enabled: body.enabled !== false }); } catch (error) { return reply.code(400).send(buildApiError("invalid_channel", error instanceof Error ? error.message : "Invalid channel.")); } });
  app.patch<{ Params: { id: string } }>("/api/admin/notification-channels/:id", owner, async (request, reply) => { try { const body = record(request.body); const existing = service.listChannels().find((item) => item.id === request.params.id); if (!existing) return reply.code(404).send(buildApiError("not_found", "Channel not found.")); return service.saveChannel({ id: existing.id, name: typeof body.name === "string" ? body.name : existing.name, type: (body.type ?? existing.type) as NotificationChannelType, config: record(body.config), enabled: body.enabled !== false }); } catch (error) { return reply.code(400).send(buildApiError("invalid_channel", error instanceof Error ? error.message : "Invalid channel.")); } });
  app.delete<{ Params: { id: string } }>("/api/admin/notification-channels/:id", owner, async (request) => ({ status: service.deleteChannel(request.params.id) ? "ok" : "not_found" }));
  app.post<{ Params: { id: string } }>("/api/admin/notification-channels/:id/test", owner, async (request, reply) => { const channel = service.listChannels().find((item) => item.id === request.params.id); if (!channel) return reply.code(404).send(buildApiError("not_found", "Channel not found.")); audit.record({ actor: request.user?.id ?? "owner", action: "notification.test", entityId: channel.id }); return { status: "queued", channel: channel.id }; });
  app.get("/api/admin/alert-rules", owner, async () => ({ rules: service.listRules() }));
  app.get("/api/admin/notification-outbox", owner, async () => ({ deliveries: db.prepare("SELECT id,channel_id AS channelId,event_type AS eventType,status,attempts,last_error AS lastError,sent_at AS sentAt,created_at AS createdAt FROM notification_outbox ORDER BY created_at DESC LIMIT 200").all() }));
  app.post("/api/admin/alert-rules", owner, async (request, reply) => { const body = record(request.body); const type = String(body.type); if (type !== "offline" && type !== "load") return reply.code(400).send(buildApiError("invalid_rule", "Only offline and load rules are supported.")); return service.saveRule({ name: String(body.name ?? "Rule"), type, nodeId: typeof body.nodeId === "string" ? body.nodeId : undefined, config: record(body.config), channelIds: Array.isArray(body.channelIds) ? body.channelIds.map(String) : [], enabled: body.enabled !== false }); });
  app.patch<{ Params: { id: string } }>("/api/admin/alert-rules/:id", owner, async (request, reply) => { const current = service.listRules().find((rule) => rule.id === request.params.id); if (!current) return reply.code(404).send(buildApiError("not_found", "Rule not found.")); const body = record(request.body); return service.saveRule({ id: current.id, name: typeof body.name === "string" ? body.name : current.name, type: current.type, nodeId: typeof body.nodeId === "string" ? body.nodeId : current.nodeId, config: record(body.config ?? current.config), channelIds: Array.isArray(body.channelIds) ? body.channelIds.map(String) : current.channelIds, enabled: body.enabled === undefined ? current.enabled : body.enabled === true }); });
  app.delete<{ Params: { id: string } }>("/api/admin/alert-rules/:id", owner, async (request) => ({ status: service.deleteRule(request.params.id) ? "ok" : "not_found" }));
  const parseIdList = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map(String);
    if (typeof value !== "string" || !value) return [];
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  };
  const mapTrafficReport = (row: { id: string; name: string; period: string; time: string; timezone: string; nodeIds: unknown; channelIds: unknown; enabled: number | boolean }) => ({
    id: row.id,
    name: row.name,
    period: row.period,
    time: row.time,
    timezone: row.timezone,
    nodeIds: parseIdList(row.nodeIds),
    channelIds: parseIdList(row.channelIds),
    enabled: row.enabled === true || row.enabled === 1
  });
  const listTrafficReports = () => (db.prepare("SELECT id,name,period,time,timezone,node_ids_json AS nodeIds,channel_ids_json AS channelIds,enabled FROM traffic_reports ORDER BY created_at DESC").all() as Array<{ id: string; name: string; period: string; time: string; timezone: string; nodeIds: unknown; channelIds: unknown; enabled: number }>).map(mapTrafficReport);
  app.get("/api/admin/traffic-reports", owner, async () => ({ reports: listTrafficReports() }));
  app.post("/api/admin/traffic-reports", owner, async (request) => {
    const body = record(request.body);
    const id = `traffic-${Date.now()}`;
    db.prepare("INSERT INTO traffic_reports(id,name,period,time,timezone,node_ids_json,channel_ids_json,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").run(id, String(body.name ?? "Traffic report"), String(body.period ?? "daily"), String(body.time ?? "09:00"), String(body.timezone ?? "Asia/Shanghai"), JSON.stringify(Array.isArray(body.nodeIds) ? body.nodeIds : []), JSON.stringify(Array.isArray(body.channelIds) ? body.channelIds : []), body.enabled === false ? 0 : 1, Date.now(), Date.now());
    audit.record({ actor: request.user?.id ?? "owner", action: "traffic_report.created", entityId: id });
    return { id };
  });
  app.patch<{ Params: { id: string } }>("/api/admin/traffic-reports/:id", owner, async (request, reply) => {
    const current = listTrafficReports().find((item) => item.id === request.params.id);
    if (!current) return reply.code(404).send(buildApiError("not_found", "Traffic report not found."));
    const body = record(request.body);
    const period = typeof body.period === "string" ? body.period : current.period;
    if (!["daily", "weekly", "monthly"].includes(period)) return reply.code(400).send(buildApiError("invalid_report", "Period must be daily, weekly or monthly."));
    db.prepare("UPDATE traffic_reports SET name=?,period=?,time=?,timezone=?,node_ids_json=?,channel_ids_json=?,enabled=?,updated_at=? WHERE id=?").run(
      typeof body.name === "string" ? body.name : current.name,
      period,
      typeof body.time === "string" ? body.time : current.time,
      typeof body.timezone === "string" ? body.timezone : current.timezone,
      JSON.stringify(Array.isArray(body.nodeIds) ? body.nodeIds.map(String) : current.nodeIds),
      JSON.stringify(Array.isArray(body.channelIds) ? body.channelIds.map(String) : current.channelIds),
      body.enabled === undefined ? (current.enabled ? 1 : 0) : body.enabled === true ? 1 : 0,
      Date.now(),
      current.id
    );
    audit.record({ actor: request.user?.id ?? "owner", action: "traffic_report.updated", entityId: current.id });
    return listTrafficReports().find((item) => item.id === current.id);
  });
  app.delete<{ Params: { id: string } }>("/api/admin/traffic-reports/:id", owner, async (request, reply) => {
    const changed = db.prepare("DELETE FROM traffic_reports WHERE id = ?").run(request.params.id).changes;
    if (!changed) return reply.code(404).send(buildApiError("not_found", "Traffic report not found."));
    audit.record({ actor: request.user?.id ?? "owner", action: "traffic_report.deleted", entityId: request.params.id });
    return { status: "ok" };
  });
  app.post("/api/internal/reports/tick", async (request, reply) => { if (env.alertmanagerWebhookToken && request.headers.authorization !== `Bearer ${env.alertmanagerWebhookToken}`) return reply.code(401).send(buildApiError("unauthorized", "Internal token required.")); return { status: "ok", dispatched: await service.dispatchPending(request.log) }; });
}
