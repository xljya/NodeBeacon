import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { buildApiError } from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";
import type { AuditService } from "../services/auditService.js";
import type { SqliteDatabase } from "../services/database.js";
import type { AuthService } from "../services/authService.js";

const TASKS = [
  { id: "system-info", label: "System information", risk: "read-only" },
  { id: "service-status", label: "Service status", risk: "read-only" },
  { id: "disk-usage", label: "Disk usage", risk: "read-only" },
  { id: "restart-nodebeacon", label: "Restart NodeBeacon", risk: "maintenance" }
] as const;

const terminalTickets = new Map<string, { expiresAt: number; targetId: string }>();

function body(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export async function registerAdminRemoteRoutes(app: FastifyInstance, env: ApiEnv, db: SqliteDatabase, audit: AuditService, auth: AuthService): Promise<void> {
  const owner = { preHandler: app.requireOwner };
  app.get("/api/admin/remote/tasks", owner, async () => ({ tasks: TASKS }));
  app.get("/api/admin/remote/targets", owner, async () => ({ targets: db.prepare("SELECT id,node_id AS nodeId,hostname,port,enabled,updated_at AS updatedAt FROM remote_targets ORDER BY node_id").all() }));
  app.post("/api/admin/remote/targets", owner, async (request, reply) => { const input = body(request.body); const nodeId = String(input.nodeId ?? ""); const hostname = String(input.hostname ?? ""); const port = Number(input.port ?? 22); if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(nodeId) || !hostname || !Number.isInteger(port) || port < 1 || port > 65535) return reply.code(400).send(buildApiError("invalid_remote_target", "Target fields are invalid.")); const id = `target-${nodeId}`; const now = Date.now(); db.prepare("INSERT INTO remote_targets(id,node_id,hostname,port,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(node_id) DO UPDATE SET hostname=excluded.hostname,port=excluded.port,updated_at=excluded.updated_at").run(id, nodeId, hostname.slice(0, 128), port, 0, now, now); return { id, enabled: false }; });
  app.patch<{ Params: { id: string } }>("/api/admin/remote/targets/:id", owner, async (request, reply) => { const input = body(request.body); const changed = db.prepare("UPDATE remote_targets SET enabled=?,updated_at=? WHERE id=?").run(input.enabled === true ? 1 : 0, Date.now(), request.params.id).changes; if (!changed) return reply.code(404).send(buildApiError("not_found", "Target not found.")); return { status: "ok" }; });
  app.post("/api/admin/remote/runs", owner, async (request, reply) => {
    const input = body(request.body); const taskId = String(input.taskId ?? ""); const targetId = String(input.targetId ?? ""); const task = TASKS.find((item) => item.id === taskId); if (!task || !targetId) return reply.code(400).send(buildApiError("invalid_remote_task", "Only predefined remote tasks are allowed."));
    if (auth.totpEnabled && !auth.verifyTotpFactor(String(input.totpCode ?? ""))) return reply.code(401).send(buildApiError("totp_required", "A valid TOTP is required for remote execution."));
    const target = db.prepare("SELECT id,enabled FROM remote_targets WHERE id = ?").get(targetId) as { id: string; enabled: number } | undefined; if (!target || target.enabled !== 1) return reply.code(400).send(buildApiError("remote_disabled", "Remote execution target is disabled."));
    const id = `run-${randomUUID()}`; db.prepare("INSERT INTO remote_runs(id,target_id,task_id,status,summary,started_at,actor) VALUES (?,?,?,?,?,?,?)").run(id, targetId, taskId, "pending", `Queued ${task.label}`, Date.now(), request.user?.id ?? "owner"); audit.record({ actor: request.user?.id ?? "owner", action: "remote.run_requested", entityId: id, payload: { taskId, targetId, risk: task.risk } }); return { id, status: "pending", task: task.id };
  });
  app.get("/api/admin/remote/runs", owner, async () => ({ runs: db.prepare("SELECT id,target_id AS targetId,task_id AS taskId,status,exit_code AS exitCode,summary,started_at AS startedAt,finished_at AS finishedAt,actor FROM remote_runs ORDER BY started_at DESC LIMIT 100").all() }));
  app.post<{ Params: { id: string } }>("/api/admin/remote/runs/:id/cancel", owner, async (request, reply) => { const changed = db.prepare("UPDATE remote_runs SET status='cancelled',finished_at=? WHERE id=? AND status IN ('pending','running')").run(Date.now(), request.params.id).changes; if (!changed) return reply.code(404).send(buildApiError("not_found", "Run not found or already finished.")); return { status: "cancelled" }; });
  app.get("/api/admin/remote/sessions", owner, async () => ({ sessions: [] }));
  app.post("/api/admin/remote/sessions", owner, async (request, reply) => { const input = body(request.body); const targetId = String(input.targetId ?? ""); const target = db.prepare("SELECT id,enabled FROM remote_targets WHERE id=?").get(targetId) as { id: string; enabled: number } | undefined; if (!target || target.enabled !== 1) return reply.code(400).send(buildApiError("remote_disabled", "Terminal target is disabled.")); if (auth.totpEnabled && !auth.verifyTotpFactor(String(input.totpCode ?? ""))) return reply.code(401).send(buildApiError("totp_required", "A valid TOTP is required.")); if (terminalTickets.size >= 2) return reply.code(429).send(buildApiError("terminal_limit", "Too many terminal sessions.")); const ticket = randomBytes(32).toString("base64url"); terminalTickets.set(ticket, { expiresAt: Date.now() + 60_000, targetId }); return { ticket, expiresAt: new Date(Date.now() + 60_000).toISOString(), status: "disabled_until_executor_rollout" }; });
  app.get<{ Params: { id: string } }>("/api/admin/remote/sessions/:id/ws", { websocket: true }, (socket, request) => { const ticket = terminalTickets.get(request.params.id); terminalTickets.delete(request.params.id); if (!request.user || !ticket || ticket.expiresAt < Date.now() || request.headers.origin !== env.webOrigin) { socket.close(1008, "terminal ticket rejected"); return; } socket.send(JSON.stringify({ type: "error", code: "executor_disabled", message: "Interactive terminal is disabled until the executor rollout is enabled." })); socket.close(1013, "executor disabled"); });
  app.get("/api/admin/remote/status", owner, async () => ({ enabled: false, executor: env.publicBaseUrl ? "planned" : "disabled", canary: "netcup-1o" }));
}
