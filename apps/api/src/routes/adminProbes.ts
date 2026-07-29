import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApiError } from "@nodebeacon/shared";
import type { SqliteDatabase } from "../services/database.js";
import { reconcileManagedProbes } from "../services/k8sReconcileService.js";

function bodyRecord(value: unknown): Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }

export async function registerAdminProbeRoutes(app: FastifyInstance, db: SqliteDatabase): Promise<void> {
  const owner = { preHandler: app.requireOwner };
  app.get("/api/admin/probes", owner, async () => ({ probes: db.prepare("SELECT id,name,protocol,target,interval_seconds AS intervalSeconds,enabled,updated_at AS updatedAt FROM latency_tasks ORDER BY name COLLATE NOCASE").all() }));
  app.post("/api/admin/probes", owner, async (request, reply) => {
    const body = bodyRecord(request.body); const protocol = String(body.protocol ?? ""); const target = String(body.target ?? "");
    if (!["http", "tcp", "icmp"].includes(protocol) || !target || target.length > 240) return reply.code(400).send(buildApiError("invalid_probe", "Protocol and target are invalid."));
    const id = `probe-${randomUUID()}`; const now = Date.now(); db.prepare("INSERT INTO latency_tasks(id,name,protocol,target,interval_seconds,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(id, String(body.name ?? target).slice(0, 80), protocol, target, Math.min(3600, Math.max(15, Number(body.intervalSeconds) || 60)), body.enabled === false ? 0 : 1, now, now); const reconciled = await reconcileManagedProbes(db, request.log); return { id, reconciled };
  });
  app.patch<{ Params: { id: string } }>("/api/admin/probes/:id", owner, async (request, reply) => {
    const current = db.prepare("SELECT * FROM latency_tasks WHERE id = ?").get(request.params.id) as { name: string; protocol: string; target: string; interval_seconds: number; enabled: number } | undefined; if (!current) return reply.code(404).send(buildApiError("not_found", "Probe not found.")); const body = bodyRecord(request.body); db.prepare("UPDATE latency_tasks SET name=?,protocol=?,target=?,interval_seconds=?,enabled=?,updated_at=? WHERE id=?").run(typeof body.name === "string" ? body.name.slice(0, 80) : current.name, current.protocol, typeof body.target === "string" ? body.target.slice(0, 240) : current.target, Math.min(3600, Math.max(15, Number(body.intervalSeconds) || current.interval_seconds)), body.enabled === undefined ? current.enabled : body.enabled === true ? 1 : 0, Date.now(), request.params.id); return { status: "ok", reconciled: await reconcileManagedProbes(db, request.log) };
  });
  app.delete<{ Params: { id: string } }>("/api/admin/probes/:id", owner, async (request) => { const status = db.prepare("DELETE FROM latency_tasks WHERE id = ?").run(request.params.id).changes ? "ok" : "not_found"; return { status, reconciled: await reconcileManagedProbes(db, request.log) }; });
}
