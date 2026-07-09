import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp } from "./helpers.js";

describe("GET /metrics (own observability)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(() => app.close());

  it("exposes request, upstream-query and cache metrics in Prometheus text format", async () => {
    // Generate some traffic first so counters exist.
    await app.inject({ method: "GET", url: "/api/status" });
    await app.inject({ method: "GET", url: "/api/status" });
    await app.inject({ method: "GET", url: "/healthz" });

    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");

    const text = res.body;
    expect(text).toContain("nodebeacon_http_requests_total");
    expect(text).toMatch(/nodebeacon_http_requests_total\{[^}]*route="\/api\/status"[^}]*status="200"[^}]*\}/);
    expect(text).toContain("nodebeacon_http_request_duration_seconds_bucket");
    expect(text).toContain("nodebeacon_cache_events_total");
    // Second /api/status within the TTL must be a cache hit.
    expect(text).toMatch(/nodebeacon_cache_events_total\{[^}]*cache="status"[^}]*event="hit"[^}]*\} [1-9]/);
    // Default process metrics come along for free.
    expect(text).toContain("process_cpu_user_seconds_total");
  });

  it("uses the route pattern, not the raw URL, for parameterized routes", async () => {
    await app.inject({ method: "GET", url: "/api/nodes/some-raw-id" });
    const text = (await app.inject({ method: "GET", url: "/metrics" })).body;
    expect(text).toContain('route="/api/nodes/:id"');
    expect(text).not.toContain("some-raw-id");
  });
});
