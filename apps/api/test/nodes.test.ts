import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

  it("public V2 detail exposes safe profile data without a session", async () => {
    const res = await app.inject({ method: "GET", url: "/api/public/nodes/rs1000/detail" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.node.id).toBe("rs1000");
    expect(body).toHaveProperty("profile");
    expect(body.profile).toMatchObject({
      cpuModel: "AMD EPYC 9645 96-Core Processor",
      physicalCpuCores: 4,
      virtualization: "KVM"
    });
    expect(body).toHaveProperty("capabilities");
    expect(body).toHaveProperty("live");
    expect(body.node).not.toHaveProperty("labels");
  });

  it("public V2 detail hides unknown nodes", async () => {
    const res = await app.inject({ method: "GET", url: "/api/public/nodes/nope/detail" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("node_not_found");
  });

  it("public latency statistics validate their source before external access", async () => {
    const invalid = await app.inject({
      method: "GET",
      url: "/api/public/nodes/rs1000/latency-stats?vantage=../unsafe"
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe("invalid_vantage");

    const hidden = await app.inject({
      method: "GET",
      url: "/api/public/nodes/nope/latency-stats?vantage=zhejiang_mobile"
    });
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json().error.code).toBe("node_not_found");
  });

  it("public latency statistics report an explicit unavailable state without RIPE configuration", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/public/nodes/rs1000/latency-stats?vantage=zhejiang_mobile"
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("latency_stats_unavailable");
  });

  it("public V2 detail hides nodes configured for authenticated visibility", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nodebeacon-public-detail-"));
    const registryPath = join(dir, "nodes.yaml");
    const seed = await readFile(new URL("../../../config/nodes.example.yaml", import.meta.url), "utf8");
    await writeFile(registryPath, seed.replace("visibility: safe", "visibility: authenticated"), "utf8");
    const privateApp = await buildTestApp({ NODEBEACON_NODE_CONFIG: registryPath });
    try {
      const res = await privateApp.inject({ method: "GET", url: "/api/public/nodes/rs1000/detail" });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("node_not_found");
    } finally {
      await privateApp.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("public V2 series validates the fixed metric catalog", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/public/nodes/rs1000/series?metrics=rate(evil)&range=1d"
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_metrics");
  });

  it("public V2 series requires Prometheus for historical data", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/public/nodes/rs1000/series?metrics=cpu,memory&range=1d"
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe("trends_unavailable");
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
