import type { FastifyInstance } from "fastify";
import type { SqliteDatabase } from "../services/database.js";
import { CURRENT_SCHEMA_VERSION } from "../services/database.js";
import { loadNodeRegistry } from "../config/nodeRegistry.js";

interface HealthRouteDependencies {
  database: SqliteDatabase;
  nodeConfigPath?: string;
  nodeConfigSeedPath?: string;
}

type ComponentStatus = { status: "ok" | "error"; schemaVersion?: number };

export async function registerHealthRoutes(
  app: FastifyInstance,
  dependencies: HealthRouteDependencies
): Promise<void> {
  app.get("/healthz", async () => ({
    status: "ok",
    service: "nodebeacon-api"
  }));

  app.get("/readyz", async (_request, reply) => {
    const components: { database: ComponentStatus; registry: ComponentStatus } = {
      database: { status: "ok" },
      registry: { status: "ok" }
    };

    try {
      dependencies.database.prepare("SELECT 1").get();
      const schemaVersion = dependencies.database.pragma("user_version", { simple: true }) as number;
      components.database.schemaVersion = schemaVersion;
      if (schemaVersion !== CURRENT_SCHEMA_VERSION) components.database.status = "error";
    } catch {
      components.database.status = "error";
    }

    try {
      await loadNodeRegistry(dependencies.nodeConfigPath, dependencies.nodeConfigSeedPath);
    } catch {
      components.registry.status = "error";
    }

    const ready = components.database.status === "ok" && components.registry.status === "ok";
    return reply.code(ready ? 200 : 503).send({
      status: ready ? "ready" : "not_ready",
      service: "nodebeacon-api",
      components
    });
  });
}
