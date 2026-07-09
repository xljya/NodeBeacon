import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { ApiStatusResponse } from "@nodebeacon/shared";
import { buildTestApp } from "./helpers.js";

describe("GET /api/status (fixture fallback, no Prometheus)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(() => app.close());

  it("returns the 5 configured nodes with a consistent summary", async () => {
    const res = await app.inject({ method: "GET", url: "/api/status" });
    expect(res.statusCode).toBe(200);

    const body = res.json() as ApiStatusResponse;
    expect(body.nodes).toHaveLength(5);
    expect(body.summary.total).toBe(5);
    expect(body.summary.online).toBe(body.nodes.filter((n) => n.online).length);
    expect(new Date(body.generatedAt).getTime()).not.toBeNaN();
    expect(body.cache.ttlSeconds).toBeGreaterThan(0);
    expect(body.cache.stale).toBe(false);
  });

  it("returns full metric sets per node", async () => {
    const body = (await app.inject({ method: "GET", url: "/api/status" })).json() as ApiStatusResponse;
    for (const node of body.nodes) {
      expect(node.id).toBeTruthy();
      expect(node.metrics.memoryTotalBytes).toBeGreaterThan(0);
      expect(node.metrics.cpuPercent).toBeGreaterThanOrEqual(0);
      expect(node.metrics.cpuPercent).toBeLessThanOrEqual(100);
    }
  });

  it("keeps group summaries in sync with node groups", async () => {
    const body = (await app.inject({ method: "GET", url: "/api/status" })).json() as ApiStatusResponse;
    const groupTotals = body.summary.groups.reduce((sum, group) => sum + group.total, 0);
    expect(groupTotals).toBe(body.nodes.length);
  });
});
