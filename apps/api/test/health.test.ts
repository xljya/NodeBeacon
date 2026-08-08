import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import Database from "better-sqlite3";
import { buildTestApp } from "./helpers.js";

const registry = `nodes:\n  - id: test-node\n    name: Test node\n    provider: test\n    group: test\n    region: local\n`;

describe("health and readiness", () => {
  const directories: string[] = [];
  const apps: FastifyInstance[] = [];

  function temporaryDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), "nodebeacon-health-"));
    directories.push(directory);
    return directory;
  }

  async function appFor(directory: string, overrides: Record<string, string> = {}) {
    const app = await buildTestApp({
      NODEBEACON_DATABASE_PATH: join(directory, "nodebeacon.db"),
      NODEBEACON_NODE_CONFIG: join(directory, "nodes.yaml"),
      NODEBEACON_NODE_CONFIG_SEED: join(directory, "nodes.seed.yaml"),
      ...overrides
    });
    apps.push(app);
    return app;
  }

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  it("keeps liveness independent and reports healthy components when ready", async () => {
    const directory = temporaryDirectory();
    writeFileSync(join(directory, "nodes.yaml"), registry);
    const app = await appFor(directory);

    const health = await app.inject({ method: "GET", url: "/healthz" });
    expect(health.statusCode).toBe(200);
    expect(health.json().status).toBe("ok");

    const readiness = await app.inject({ method: "GET", url: "/readyz" });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toMatchObject({
      status: "ready",
      components: {
        database: { status: "ok", schemaVersion: 6 },
        registry: { status: "ok" }
      }
    });
  });

  it("uses the seed registry when the runtime YAML is corrupt", async () => {
    const directory = temporaryDirectory();
    writeFileSync(join(directory, "nodes.yaml"), "nodes: [");
    writeFileSync(join(directory, "nodes.seed.yaml"), registry);
    const readiness = await (await appFor(directory)).inject({ method: "GET", url: "/readyz" });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json().components.registry.status).toBe("ok");
  });

  it("returns 503 when both registry files are unavailable", async () => {
    const directory = temporaryDirectory();
    writeFileSync(join(directory, "nodes.yaml"), "nodes: [");
    writeFileSync(join(directory, "nodes.seed.yaml"), "nodes: [");
    const readiness = await (await appFor(directory)).inject({ method: "GET", url: "/readyz" });
    expect(readiness.statusCode).toBe(503);
    expect(readiness.json()).toMatchObject({
      status: "not_ready",
      components: { database: { status: "ok" }, registry: { status: "error" } }
    });
    expect(readiness.body).not.toContain(directory);
  });

  it("returns 503 for an unexpected schema version without exposing paths", async () => {
    const directory = temporaryDirectory();
    writeFileSync(join(directory, "nodes.yaml"), registry);
    const app = await appFor(directory);
    const database = new Database(join(directory, "nodebeacon.db"));
    database.pragma("user_version = 1");
    database.close();

    const readiness = await app.inject({ method: "GET", url: "/readyz" });
    expect(readiness.statusCode).toBe(503);
    expect(readiness.json().components.database).toEqual({ status: "error", schemaVersion: 1 });
    expect(readiness.body).not.toContain(directory);
  });
});
