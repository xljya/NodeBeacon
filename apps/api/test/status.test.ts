import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { statusFixture, type ApiStatusResponse, type StatusNode } from "@nodebeacon/shared";
import { toPublicStatusNode } from "../src/services/statusService.js";
import { buildTestApp, loginOwner } from "./helpers.js";

describe("GET /api/status (fixture fallback, no Prometheus)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(() => app.close());

  it("returns the 5 configured nodes with a consistent summary", async () => {
    const res = await app.inject({ method: "GET", url: "/api/status" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");

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
      expect(node.metrics.networkRxBytesTotal).toBeGreaterThan(0);
      expect(node.metrics.networkTxBytesTotal).toBeGreaterThan(0);
    }
  });

  it("only exposes explicitly public node fields", async () => {
    const body = (await app.inject({ method: "GET", url: "/api/status" })).json() as ApiStatusResponse;
    const privateFields = [
      "labels",
      "ipAddress",
      "clientVersion",
      "privateNotes",
      "billing",
      "detail"
    ];

    for (const node of body.nodes) {
      for (const field of privateFields) {
        expect(node).not.toHaveProperty(field);
      }
    }
  });

  it("strips every registry-only field from a fully populated runtime node", () => {
    const internalNode = {
      ...statusFixture.nodes[0]!,
      labels: { job: "private", instance: "10.0.0.1:9100" },
      ipAddress: "10.0.0.1",
      clientVersion: "private-version",
      privateNotes: "owner only",
      billing: { price: 10 },
      detail: { visibility: "authenticated" }
    } as StatusNode & Record<string, unknown>;

    const publicNode = toPublicStatusNode(internalNode) as Record<string, unknown>;
    expect(publicNode).not.toHaveProperty("labels");
    expect(publicNode).not.toHaveProperty("ipAddress");
    expect(publicNode).not.toHaveProperty("clientVersion");
    expect(publicNode).not.toHaveProperty("privateNotes");
    expect(publicNode).not.toHaveProperty("billing");
    expect(publicNode).not.toHaveProperty("detail");
  });

  it("does not reveal nodes marked private in the public status response", async () => {
    const directory = await mkdtemp(join(tmpdir(), "nodebeacon-public-status-"));
    const registryPath = join(directory, "nodes.yaml");
    const seed = await readFile(new URL("../../../config/nodes.example.yaml", import.meta.url), "utf8");
    await writeFile(registryPath, seed.replace("public: true", "public: false"), "utf8");
    const privateNodeApp = await buildTestApp({ NODEBEACON_NODE_CONFIG: registryPath });
    try {
      const body = (await privateNodeApp.inject({ method: "GET", url: "/api/status" })).json() as ApiStatusResponse;
      expect(body.nodes).toHaveLength(4);
      expect(body.summary.total).toBe(4);
      expect(body.nodes.some((node) => node.id === "rs1000")).toBe(false);
    } finally {
      await privateNodeApp.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("keeps group summaries in sync with node groups", async () => {
    const body = (await app.inject({ method: "GET", url: "/api/status" })).json() as ApiStatusResponse;
    const groupTotals = body.summary.groups.reduce((sum, group) => sum + group.total, 0);
    expect(groupTotals).toBe(body.nodes.length);
  });

  it("returns unknown zero metrics when a configured Prometheus is unreachable at cold start", async () => {
    const failingApp = await buildTestApp({
      PROMETHEUS_URL: "http://127.0.0.1:1",
      PROMETHEUS_TIMEOUT_MS: "100"
    });
    try {
      const body = (await failingApp.inject({ method: "GET", url: "/api/status" })).json() as ApiStatusResponse;
      expect(body.cache.stale).toBe(true);
      expect(body.nodes).toHaveLength(5);
      for (const node of body.nodes) {
        expect(node.status).toBe("unknown");
        expect(node.online).toBe(false);
        expect(node.metrics).toMatchObject({
          cpuPercent: 0,
          memoryTotalBytes: 0,
          diskTotalBytes: 0,
          uptimeSeconds: 0
        });
      }
      const cookies = await loginOwner(failingApp);
      const summary = await failingApp.inject({ method: "GET", url: "/api/admin/summary", cookies });
      expect(summary.statusCode).toBe(200);
      expect(summary.json().prometheus.reachable).toBe(false);
    } finally {
      await failingApp.close();
    }
  });
});
