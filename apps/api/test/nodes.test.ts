import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, loginOwner } from "./helpers.js";

describe("node routes without Prometheus configured", () => {
  let app: FastifyInstance;
  let cookies: Record<string, string>;

  beforeAll(async () => {
    app = await buildTestApp();
    cookies = await loginOwner(app);
  });
  afterAll(() => app.close());

  it("GET /api/nodes is public and hides the Prometheus label mapping", async () => {
    const res = await app.inject({ method: "GET", url: "/api/nodes" });
    expect(res.statusCode).toBe(200);
    const { nodes } = res.json();
    expect(nodes).toHaveLength(5);
    for (const node of nodes) {
      expect(node).not.toHaveProperty("labels");
      expect(node.id).toBeTruthy();
      expect(typeof node.online).toBe("boolean");
    }
  });

  it("GET /api/nodes/:id requires a session", async () => {
    const res = await app.inject({ method: "GET", url: "/api/nodes/rs1000" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/nodes/:id returns the full node for the owner", async () => {
    const res = await app.inject({ method: "GET", url: "/api/nodes/rs1000", cookies });
    expect(res.statusCode).toBe(200);
    const { node } = res.json();
    expect(node.id).toBe("rs1000");
    expect(node.labels).toBeTypeOf("object");
  });

  it("GET /api/nodes/:id returns 404 for an unknown id", async () => {
    const res = await app.inject({ method: "GET", url: "/api/nodes/nope", cookies });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("node_not_found");
  });

  it("range endpoint requires a session", async () => {
    const res = await app.inject({ method: "GET", url: "/api/nodes/rs1000/range?metric=cpu&range=1h" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects a non-whitelisted metric with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/nodes/rs1000/range?metric=rate(evil)&range=1h",
      cookies
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_metric");
  });

  it("rejects a non-whitelisted range with 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/nodes/rs1000/range?metric=cpu&range=99d",
      cookies
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_range");
  });

  it("returns 503 trends_unavailable when Prometheus is not configured", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/nodes/rs1000/range?metric=cpu&range=1h",
      cookies
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("trends_unavailable");
  });

  it("GET /api/latency returns an empty probe list without Prometheus", async () => {
    const res = await app.inject({ method: "GET", url: "/api/latency" });
    expect(res.statusCode).toBe(200);
    expect(res.json().probes).toEqual([]);
  });
});
