import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildApiError } from "@nodebeacon/shared";
import type { ApiEnv } from "../config/env.js";
import type { SqliteDatabase } from "../services/database.js";
import { buildChinaIspPingTasks, chinaIspPingCatalog, type ChinaIspPingTask } from "../services/chinaIspPingCatalog.js";
import { reconcileManagedProbes } from "../services/k8sReconcileService.js";
import { MANAGED_PROBE_TARGET_LIMIT, tcpFamilyForTarget } from "../services/managedProbes.js";
import { getAdminProbeResults } from "../services/probeService.js";

function bodyRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function clampInterval(value: unknown, fallback = 60): number {
  return Math.min(3600, Math.max(15, Number(value) || fallback));
}

function parseChinaIspSelection(body: Record<string, unknown>): { tasks: ChinaIspPingTask[] } | { error: string } {
  try {
    return {
      tasks: buildChinaIspPingTasks({
        provinces: stringArray(body.provinces),
        carriers: stringArray(body.carriers),
        ipFamilies: stringArray(body.ipFamilies)
      })
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid China ISP ping selection." };
  }
}

function enabledTcpCounts(db: SqliteDatabase): { tcp: number; tcp6: number } {
  const rows = db.prepare("SELECT target FROM latency_tasks WHERE protocol = 'tcp' AND enabled = 1").all() as Array<{ target: string }>;
  let tcp = 0;
  let tcp6 = 0;
  for (const row of rows) {
    if (tcpFamilyForTarget(row.target) === "tcp6") tcp6 += 1;
    else tcp += 1;
  }
  return { tcp, tcp6 };
}

export async function registerAdminProbeRoutes(app: FastifyInstance, env: ApiEnv, db: SqliteDatabase): Promise<void> {
  const owner = { preHandler: app.requireOwner };

  app.get("/api/admin/probes", owner, async () => ({
    probes: db.prepare("SELECT id,name,protocol,target,interval_seconds AS intervalSeconds,enabled,updated_at AS updatedAt FROM latency_tasks ORDER BY name COLLATE NOCASE").all()
  }));

  app.get("/api/admin/probes/catalog", owner, async () => chinaIspPingCatalog());

  app.get("/api/admin/probes/results", owner, async (request) => getAdminProbeResults(env, request.log));

  app.post("/api/admin/probes", owner, async (request, reply) => {
    const body = bodyRecord(request.body);
    const protocol = String(body.protocol ?? "");
    const target = String(body.target ?? "").trim();
    if (!["http", "tcp", "icmp"].includes(protocol) || !target || target.length > 240) {
      return reply.code(400).send(buildApiError("invalid_probe", "Protocol and target are invalid."));
    }
    if (protocol === "tcp") {
      const family = tcpFamilyForTarget(target);
      const counts = enabledTcpCounts(db);
      if ((family === "tcp6" ? counts.tcp6 : counts.tcp) >= MANAGED_PROBE_TARGET_LIMIT) {
        return reply.code(400).send(buildApiError("probe_limit", `At most ${MANAGED_PROBE_TARGET_LIMIT} enabled ${family} probes are allowed.`));
      }
    }
    const id = `probe-${randomUUID()}`;
    const now = Date.now();
    db.prepare("INSERT INTO latency_tasks(id,name,protocol,target,interval_seconds,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(id, String(body.name ?? target).slice(0, 80), protocol, target, clampInterval(body.intervalSeconds), body.enabled === false ? 0 : 1, now, now);
    const reconciled = await reconcileManagedProbes(db, request.log);
    return { id, reconciled };
  });

  app.post("/api/admin/probes/batch", owner, async (request, reply) => {
    const parsed = parseChinaIspSelection(bodyRecord(request.body));
    if ("error" in parsed) return reply.code(400).send(buildApiError("invalid_probe", parsed.error));
    const body = bodyRecord(request.body);
    const intervalSeconds = clampInterval(body.intervalSeconds);
    const enabled = body.enabled === false ? 0 : 1;
    const existing = new Set(
      (db.prepare("SELECT target FROM latency_tasks WHERE protocol = 'tcp'").all() as Array<{ target: string }>).map((row) => row.target)
    );
    const createdTasks = parsed.tasks.filter((task) => !existing.has(task.target));
    if (enabled === 1) {
      const counts = enabledTcpCounts(db);
      const newV4 = createdTasks.filter((task) => task.ipFamily === "v4").length;
      const newV6 = createdTasks.filter((task) => task.ipFamily === "v6").length;
      if (counts.tcp + newV4 > MANAGED_PROBE_TARGET_LIMIT || counts.tcp6 + newV6 > MANAGED_PROBE_TARGET_LIMIT) {
        return reply.code(400).send(buildApiError(
          "probe_limit",
          `This batch would exceed the ${MANAGED_PROBE_TARGET_LIMIT} enabled TCP probes allowed per IP family.`
        ));
      }
    }
    const now = Date.now();
    const insert = db.prepare("INSERT INTO latency_tasks(id,name,protocol,target,interval_seconds,enabled,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)");
    const create = db.transaction((tasks: ChinaIspPingTask[]) => {
      for (const task of tasks) {
        insert.run(`probe-${randomUUID()}`, task.name.slice(0, 80), task.protocol, task.target, intervalSeconds, enabled, now, now);
      }
    });
    create(createdTasks);
    return {
      created: createdTasks.length,
      skipped: parsed.tasks.length - createdTasks.length,
      total: parsed.tasks.length,
      reconciled: await reconcileManagedProbes(db, request.log)
    };
  });

  app.post("/api/admin/probes/batch/delete", owner, async (request, reply) => {
    const parsed = parseChinaIspSelection(bodyRecord(request.body));
    if ("error" in parsed) return reply.code(400).send(buildApiError("invalid_probe", parsed.error));
    const targets = parsed.tasks.map((task) => task.target);
    if (!targets.length) return { deleted: 0, reconciled: false };
    const placeholders = targets.map(() => "?").join(",");
    const deleted = db.prepare(`DELETE FROM latency_tasks WHERE protocol = 'tcp' AND target IN (${placeholders})`).run(...targets).changes;
    return { deleted, reconciled: await reconcileManagedProbes(db, request.log) };
  });

  app.patch<{ Params: { id: string } }>("/api/admin/probes/:id", owner, async (request, reply) => {
    const current = db.prepare("SELECT * FROM latency_tasks WHERE id = ?").get(request.params.id) as { name: string; protocol: string; target: string; interval_seconds: number; enabled: number } | undefined;
    if (!current) return reply.code(404).send(buildApiError("not_found", "Probe not found."));
    const body = bodyRecord(request.body);
    const nextEnabled = body.enabled === undefined ? current.enabled : body.enabled === true ? 1 : 0;
    if (current.protocol === "tcp" && current.enabled !== 1 && nextEnabled === 1) {
      const family = tcpFamilyForTarget(current.target);
      const counts = enabledTcpCounts(db);
      if ((family === "tcp6" ? counts.tcp6 : counts.tcp) >= MANAGED_PROBE_TARGET_LIMIT) {
        return reply.code(400).send(buildApiError("probe_limit", `At most ${MANAGED_PROBE_TARGET_LIMIT} enabled ${family} probes are allowed.`));
      }
    }
    db.prepare("UPDATE latency_tasks SET name=?,protocol=?,target=?,interval_seconds=?,enabled=?,updated_at=? WHERE id=?")
      .run(
        typeof body.name === "string" ? body.name.slice(0, 80) : current.name,
        current.protocol,
        typeof body.target === "string" ? body.target.slice(0, 240) : current.target,
        clampInterval(body.intervalSeconds, current.interval_seconds),
        nextEnabled,
        Date.now(),
        request.params.id
      );
    return { status: "ok", reconciled: await reconcileManagedProbes(db, request.log) };
  });

  app.delete<{ Params: { id: string } }>("/api/admin/probes/:id", owner, async (request) => {
    const status = db.prepare("DELETE FROM latency_tasks WHERE id = ?").run(request.params.id).changes ? "ok" : "not_found";
    return { status, reconciled: await reconcileManagedProbes(db, request.log) };
  });
}
