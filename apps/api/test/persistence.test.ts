import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { openDatabase } from "../src/services/database.js";
import { backupDatabase } from "../src/cli/backupDatabase.js";
import { buildTestApp, loginOwner } from "./helpers.js";

function registryYaml(): string {
  return [
    "nodes:",
    "  - id: seed",
    "    name: Seed",
    "    provider: test",
    "    group: Lab",
    "    region: Test",
    "    displayOrder: 10",
    "    public: true",
    "    labels:",
    "      job: node-exporter",
    ""
  ].join("\n");
}

describe("SQLite sessions and audit events", () => {
  let dir: string;
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  async function paths() {
    dir = await mkdtemp(join(tmpdir(), "nodebeacon-state-"));
    const databasePath = join(dir, "nodebeacon.db");
    const registryPath = join(dir, "nodes.yaml");
    await writeFile(registryPath, registryYaml(), "utf8");
    return { databasePath, registryPath };
  }

  it("applies the schema migration idempotently", async () => {
    const { databasePath } = await paths();
    const first = openDatabase(databasePath);
    expect(first.pragma("user_version", { simple: true })).toBe(5);
    first.close();

    const second = openDatabase(databasePath);
    expect(second.pragma("user_version", { simple: true })).toBe(5);
    const tables = second.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
    expect(tables.map((table) => table.name)).toEqual(expect.arrayContaining(["sessions", "audit_events", "incidents"]));
    second.close();
  });

  it("creates an integrity-checked online backup", async () => {
    const { databasePath } = await paths();
    const source = openDatabase(databasePath);
    source.prepare("INSERT INTO audit_events(ts, actor, action) VALUES (?, ?, ?)").run(Date.now(), "owner", "test.event");
    const backupPath = join(dir, "backup.db");
    await backupDatabase(databasePath, backupPath);
    source.close();

    const backup = openDatabase(backupPath);
    expect(backup.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(backup.prepare("SELECT action FROM audit_events").get()).toMatchObject({ action: "test.event" });
    backup.close();
    await expect(access(`${backupPath}-wal`)).rejects.toThrow();
    await expect(access(`${backupPath}-shm`)).rejects.toThrow();
  });

  it("keeps an active session across an app restart", async () => {
    const { databasePath } = await paths();
    const first = await buildTestApp({ NODEBEACON_DATABASE_PATH: databasePath });
    apps.push(first);
    const cookies = await loginOwner(first);
    await first.close();
    apps.splice(apps.indexOf(first), 1);

    const second = await buildTestApp({ NODEBEACON_DATABASE_PATH: databasePath });
    apps.push(second);
    const me = await second.inject({ method: "GET", url: "/api/auth/me", cookies });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.id).toBe("owner");
  });

  it("lists active sessions and revokes one session without affecting another", async () => {
    const { databasePath } = await paths();
    const app = await buildTestApp({ NODEBEACON_DATABASE_PATH: databasePath });
    apps.push(app);
    const first = await loginOwner(app);
    const second = await loginOwner(app);

    const list = await app.inject({ method: "GET", url: "/api/admin/sessions", cookies: first });
    expect(list.statusCode).toBe(200);
    expect(list.json().sessions).toHaveLength(2);
    const other = list.json().sessions.find((session: { current: boolean }) => !session.current);
    expect(other).toBeDefined();

    const revoke = await app.inject({
      method: "DELETE",
      url: `/api/admin/sessions/${other.id}`,
      cookies: first
    });
    expect(revoke.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/auth/me", cookies: second })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/auth/me", cookies: first })).statusCode).toBe(200);
  });

  it("persists node mutation audit events", async () => {
    const { databasePath, registryPath } = await paths();
    const app = await buildTestApp({
      NODEBEACON_DATABASE_PATH: databasePath,
      NODEBEACON_NODE_CONFIG: registryPath
    });
    apps.push(app);
    const cookies = await loginOwner(app);

    await app.inject({
      method: "POST",
      url: "/api/admin/nodes",
      cookies,
      payload: { id: "audited", name: "Audited", labels: { job: "node-exporter" } }
    });
    await app.inject({
      method: "PATCH",
      url: "/api/admin/nodes/audited",
      cookies,
      payload: { group: "Changed" }
    });
    await app.inject({ method: "DELETE", url: "/api/admin/nodes/audited", cookies });

    const audit = await app.inject({ method: "GET", url: "/api/admin/audit-events", cookies });
    expect(audit.statusCode).toBe(200);
    const actions = audit.json().events.map((event: { action: string }) => event.action);
    expect(actions).toEqual(expect.arrayContaining(["node.created", "node.updated", "node.deleted"]));
  });

  it("prunes expired persisted state while retaining active incidents and sessions", async () => {
    const { databasePath } = await paths();
    const now = Date.now();
    const old = now - 400 * 24 * 60 * 60 * 1000;
    const database = openDatabase(databasePath);
    database.prepare(`
      INSERT INTO incidents(
        fingerprint, alert_name, status, started_at, resolved_at, updated_at,
        labels_json, annotations_json
      ) VALUES (?, ?, ?, ?, ?, ?, '{}', '{}')
    `).run("old-resolved", "OldResolved", "resolved", old, old, old);
    database.prepare(`
      INSERT INTO incidents(
        fingerprint, alert_name, status, started_at, resolved_at, updated_at,
        labels_json, annotations_json
      ) VALUES (?, ?, ?, ?, NULL, ?, '{}', '{}')
    `).run("old-firing", "OldFiring", "firing", old, old);
    database.prepare("INSERT INTO audit_events(ts, actor, action) VALUES (?, ?, ?)")
      .run(old, "owner", "old.event");
    database.prepare("INSERT INTO sessions(id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run("expired", "owner", old, old);
    database.prepare(`
      INSERT INTO sessions(id, user_id, created_at, expires_at, revoked_at)
      VALUES (?, ?, ?, ?, ?)
    `).run("revoked", "owner", old, now + 60_000, old);
    database.prepare("INSERT INTO sessions(id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run("active", "owner", now, now + 60_000);
    database.close();

    const app = await buildTestApp({
      NODEBEACON_DATABASE_PATH: databasePath,
      INCIDENT_RETENTION_DAYS: "180",
      AUDIT_RETENTION_DAYS: "365",
      REVOKED_SESSION_RETENTION_DAYS: "30"
    });
    apps.push(app);

    const check = openDatabase(databasePath);
    expect(check.prepare("SELECT alert_name FROM incidents ORDER BY alert_name").all())
      .toEqual([{ alert_name: "OldFiring" }]);
    expect(check.prepare("SELECT count(*) AS count FROM audit_events").get()).toMatchObject({ count: 0 });
    expect(check.prepare("SELECT id FROM sessions ORDER BY id").all()).toEqual([{ id: "active" }]);
    check.close();
  });
});
