import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { buildTestApp, loginOwner } from "./helpers.js";

describe("Alertmanager alerts and incident webhook", () => {
  let upstream: Server;
  let upstreamUrl: string;
  let app: FastifyInstance;
  let cookies: Record<string, string>;

  beforeAll(async () => {
    upstream = createServer((request, response) => {
      if (request.url?.startsWith("/api/v2/alerts")) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify([
          {
            fingerprint: "active-fingerprint",
            status: { state: "active" },
            labels: { alertname: "NodeDown", severity: "critical", node_id: "alpha" },
            annotations: { summary: "Alpha is down" },
            startsAt: "2026-07-11T00:00:00.000Z",
            endsAt: "2026-07-11T01:00:00.000Z",
            updatedAt: "2026-07-11T00:01:00.000Z",
            generatorURL: "http://prometheus/graph"
          },
          {
            fingerprint: "suppressed-fingerprint",
            status: { state: "suppressed" },
            labels: { alertname: "Suppressed" },
            annotations: {},
            startsAt: "2026-07-11T00:00:00.000Z",
            endsAt: "2026-07-11T01:00:00.000Z"
          }
        ]));
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const address = upstream.address() as AddressInfo;
    upstreamUrl = `http://127.0.0.1:${address.port}`;
    app = await buildTestApp({
      ALERTMANAGER_URL: upstreamUrl,
      ALERTMANAGER_WEBHOOK_TOKEN: "test-alertmanager-webhook-token"
    });
    cookies = await loginOwner(app);
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
  });

  it("returns only active Alertmanager alerts to the owner", async () => {
    const response = await app.inject({ method: "GET", url: "/api/admin/alerts", cookies });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ configured: true });
    expect(response.json().alerts).toHaveLength(1);
    expect(response.json().alerts[0]).toMatchObject({
      fingerprint: "active-fingerprint",
      state: "active",
      labels: { alertname: "NodeDown", node_id: "alpha" }
    });
  });

  it("rejects a webhook with the wrong token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/webhooks/alertmanager",
      headers: { authorization: "Bearer wrong" },
      payload: { status: "firing", alerts: [] }
    });
    expect(response.statusCode).toBe(401);
  });

  it("counts invalid webhook payloads separately", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/webhooks/alertmanager",
      headers: { authorization: "Bearer test-alertmanager-webhook-token" },
      payload: { status: "firing", alerts: [{ status: "firing" }] }
    });
    expect(response.statusCode).toBe(400);
  });

  it("stores firing and resolved webhook retries as one incident", async () => {
    const alert = {
      fingerprint: "incident-fingerprint",
      labels: { alertname: "NodeDown", severity: "critical", node_id: "alpha", private_label: "hidden" },
      annotations: { summary: "Alpha is down", description: "No scrape samples" },
      startsAt: "2026-07-11T00:00:00.000Z",
      endsAt: "2026-07-11T00:05:00.000Z",
      generatorURL: "http://prometheus/graph"
    };

    for (const status of ["firing", "firing", "resolved"] as const) {
      const response = await app.inject({
        method: "POST",
        url: "/api/webhooks/alertmanager",
        headers: { authorization: "Bearer test-alertmanager-webhook-token" },
        payload: { status, alerts: [{ ...alert, status }] }
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().processed).toBe(1);
    }

    const publicResponse = await app.inject({ method: "GET", url: "/api/incidents?nodeId=alpha" });
    expect(publicResponse.statusCode).toBe(200);
    expect(publicResponse.json().incidents).toHaveLength(1);
    expect(publicResponse.json().incidents[0]).toMatchObject({
      alertName: "NodeDown",
      status: "resolved",
      nodeId: "alpha",
      summary: "Alpha is down"
    });
    expect(publicResponse.json().incidents[0]).not.toHaveProperty("labels");

    const adminResponse = await app.inject({ method: "GET", url: "/api/admin/incidents", cookies });
    expect(adminResponse.json().incidents[0].labels.private_label).toBe("hidden");
  });

  it("exposes Alertmanager read and webhook outcome metrics", async () => {
    const response = await app.inject({ method: "GET", url: "/metrics" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('nodebeacon_alertmanager_reads_total{outcome="success"}');
    expect(response.body).toContain("nodebeacon_alertmanager_read_duration_seconds_count");
    expect(response.body).toContain('nodebeacon_alertmanager_webhook_requests_total{outcome="success"}');
    expect(response.body).toContain('nodebeacon_alertmanager_webhook_requests_total{outcome="invalid_auth"}');
    expect(response.body).toContain('nodebeacon_alertmanager_webhook_requests_total{outcome="invalid_payload"}');
  });
});
