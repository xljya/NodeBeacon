import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { ApiLatencyResponse, ApiNodeRangeResponse, ApiStatusResponse } from "@nodebeacon/shared";
import { buildTestApp, loginOwner } from "./helpers.js";
import { startMockPrometheus, type MockPrometheus } from "./mockPrometheus.js";

describe("real-Prometheus paths against a mock upstream", () => {
  let prom: MockPrometheus;
  let app: FastifyInstance;
  let cookies: Record<string, string>;

  beforeAll(async () => {
    prom = await startMockPrometheus();
    app = await buildTestApp({ PROMETHEUS_URL: prom.url });
    cookies = await loginOwner(app);
  });
  afterAll(async () => {
    await app.close();
    await prom.close();
  });

  it("GET /api/status serves live (non-stale) data", async () => {
    const res = await app.inject({ method: "GET", url: "/api/status" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ApiStatusResponse;
    expect(body.cache.stale).toBe(false);
    expect(body.summary.online).toBe(5);
    const node = body.nodes[0];
    expect(node.metrics.memoryTotalBytes).toBe(8 * 1024 ** 3);
    expect(node.metrics.load1).toBeCloseTo(0.42);
  });

  it("range endpoint returns a percent series for cpu", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/nodes/rs1000/range?metric=cpu&range=1h",
      cookies
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ApiNodeRangeResponse;
    expect(body).toMatchObject({ nodeId: "rs1000", metric: "cpu", range: "1h", unit: "percent", stepSeconds: 30 });
    expect(body.series).toHaveLength(1);
    expect(body.series[0].points.length).toBeGreaterThan(100);
  });

  it("range endpoint returns rx and tx series for network", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/nodes/rs1000/range?metric=network&range=4h",
      cookies
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ApiNodeRangeResponse;
    expect(body.unit).toBe("bytes_per_second");
    expect(body.series.map((s) => s.name)).toEqual(["rx", "tx"]);
  });

  it("range endpoint returns 404 for an unknown node when Prometheus exists", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/nodes/nope/range?metric=cpu&range=1h",
      cookies
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/latency aggregates blackbox probes per target", async () => {
    const res = await app.inject({ method: "GET", url: "/api/latency" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ApiLatencyResponse;
    expect(body.cache.stale).toBe(false);
    expect(body.probes).toHaveLength(2);
    const probe = body.probes[0];
    expect(probe).toMatchObject({
      target: "https://a.example.com/",
      success: true,
      httpStatusCode: 200
    });
    expect(probe.latencySeconds).toBeCloseTo(0.234);
    expect(probe.successRate24h).toBeCloseTo(0.995);
    expect(new Date(probe.sslExpiresAt ?? "").getTime()).toBeGreaterThan(Date.now());
  });
});
