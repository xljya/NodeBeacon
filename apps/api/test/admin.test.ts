import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, loginOwner, OWNER_EMAIL } from "./helpers.js";

describe("admin routes (owner-only)", () => {
  let app: FastifyInstance;
  let cookies: Record<string, string>;

  beforeAll(async () => {
    app = await buildTestApp();
    cookies = await loginOwner(app);
  });
  afterAll(() => app.close());

  it.each([
    "/api/admin/summary",
    "/api/admin/nodes",
    "/api/admin/users",
    "/api/admin/sessions",
    "/api/admin/audit-events",
    "/api/admin/alerts",
    "/api/admin/incidents"
  ])(
    "returns 401 for %s without a session",
    async (url) => {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
    }
  );

  it("returns the summary for the owner", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/summary", cookies });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.nodes.total).toBe(5);
    expect(body.prometheus.configured).toBe(false);
    expect(body.auth).toMatchObject({ allowRegister: false, ownerConfigured: true });
  });

  it("returns admin nodes including the Prometheus label mapping", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/nodes", cookies });
    expect(res.statusCode).toBe(200);
    const { nodes } = res.json();
    expect(nodes).toHaveLength(5);
    // Admin view exposes labels (unlike the public /api/nodes).
    expect(nodes[0].labels).toBeTypeOf("object");
  });

  it("lists the env-provisioned owner account", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/users", cookies });
    expect(res.statusCode).toBe(200);
    expect(res.json().users).toEqual([{ id: "owner", email: OWNER_EMAIL, role: "owner" }]);
  });

  it("creates, updates and deletes node registry entries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nodebeacon-admin-"));
    const registryPath = join(dir, "nodes.yaml");
    await writeFile(
      registryPath,
      [
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
        "    tags:",
        "      - seed",
        ""
      ].join("\n"),
      "utf8"
    );

    const mutableApp = await buildTestApp({ NODEBEACON_NODE_CONFIG: registryPath });
    const mutableCookies = await loginOwner(mutableApp);

    try {
      const create = await mutableApp.inject({
        method: "POST",
        url: "/api/admin/nodes",
        cookies: mutableCookies,
        payload: {
          id: "new-node",
          name: "New Node",
          provider: "Test",
          group: "Edge",
          region: "US",
          displayOrder: 20,
          public: true,
          labels: { job: "external-vps-node", instance: "new-node" },
          tags: ["test"],
          ipAddress: "10.77.0.9:9100",
          clientVersion: "1.2.3",
          privateNotes: "owner-only",
          billing: { price: 6, currency: "USD", cycleDays: 30 }
        }
      });
      expect(create.statusCode).toBe(200);
      expect(create.json().node).toMatchObject({ id: "new-node", group: "Edge" });

      const update = await mutableApp.inject({
        method: "PATCH",
        url: "/api/admin/nodes/new-node",
        cookies: mutableCookies,
        payload: { group: "Core", privateNotes: "updated" }
      });
      expect(update.statusCode).toBe(200);
      expect(update.json().node).toMatchObject({ id: "new-node", group: "Core", privateNotes: "updated" });

      const contentAfterUpdate = await readFile(registryPath, "utf8");
      expect(contentAfterUpdate).toContain("new-node");
      expect(contentAfterUpdate).toContain("privateNotes: updated");

      const remove = await mutableApp.inject({
        method: "DELETE",
        url: "/api/admin/nodes/new-node",
        cookies: mutableCookies
      });
      expect(remove.statusCode).toBe(200);
      expect(remove.json()).toEqual({ ok: true });
      expect(await readFile(registryPath, "utf8")).not.toContain("new-node");
    } finally {
      await mutableApp.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
