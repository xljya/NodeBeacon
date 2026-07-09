import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, loginOwner, OWNER_EMAIL } from "./helpers.js";

describe("admin read-only routes (owner-only)", () => {
  let app: FastifyInstance;
  let cookies: Record<string, string>;

  beforeAll(async () => {
    app = await buildTestApp();
    cookies = await loginOwner(app);
  });
  afterAll(() => app.close());

  it.each(["/api/admin/summary", "/api/admin/nodes", "/api/admin/users"])(
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
});
