import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, loginOwner } from "./helpers.js";

describe("traffic report admin API", () => {
  let app: FastifyInstance;
  let cookies: Record<string, string>;

  beforeAll(async () => {
    app = await buildTestApp();
    cookies = await loginOwner(app);
  });
  afterAll(() => app.close());

  it("rejects anonymous and cross-origin mutations", async () => {
    const anonymous = await app.inject({ method: "POST", url: "/api/admin/traffic-reports", payload: { name: "blocked" } });
    expect(anonymous.statusCode).toBe(401);

    const created = await app.inject({
      method: "POST",
      url: "/api/admin/traffic-reports",
      cookies,
      payload: { name: "Daily", period: "daily", time: "09:00", timezone: "Asia/Shanghai", nodeIds: ["rs1000"], channelIds: [] }
    });
    expect(created.statusCode).toBe(200);
    const { id } = created.json() as { id: string };

    const crossOrigin = await app.inject({
      method: "PATCH",
      url: `/api/admin/traffic-reports/${id}`,
      cookies,
      headers: { origin: "https://evil.example" },
      payload: { enabled: false }
    });
    expect(crossOrigin.statusCode).toBe(403);
    expect(crossOrigin.json().error.code).toBe("origin_mismatch");
  });

  it("creates, updates, deletes and records audit events", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/admin/traffic-reports",
      cookies,
      payload: { name: "Weekly", period: "weekly", time: "10:00", timezone: "Asia/Shanghai", nodeIds: ["rs1000"], channelIds: ["channel-1"], enabled: true }
    });
    expect(created.statusCode).toBe(200);
    const { id } = created.json() as { id: string };

    const listed = await app.inject({ method: "GET", url: "/api/admin/traffic-reports", cookies });
    expect(listed.statusCode).toBe(200);
    const report = listed.json().reports.find((item: { id: string }) => item.id === id);
    expect(report).toMatchObject({
      name: "Weekly",
      period: "weekly",
      nodeIds: ["rs1000"],
      channelIds: ["channel-1"],
      enabled: true
    });

    const updated = await app.inject({
      method: "PATCH",
      url: `/api/admin/traffic-reports/${id}`,
      cookies,
      payload: { name: "Weekly west", enabled: false, nodeIds: ["dmit-uswest"] }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      id,
      name: "Weekly west",
      enabled: false,
      nodeIds: ["dmit-uswest"]
    });

    const removed = await app.inject({ method: "DELETE", url: `/api/admin/traffic-reports/${id}`, cookies });
    expect(removed.statusCode).toBe(200);

    const missing = await app.inject({ method: "DELETE", url: `/api/admin/traffic-reports/${id}`, cookies });
    expect(missing.statusCode).toBe(404);

    const audit = await app.inject({ method: "GET", url: "/api/admin/audit-events?limit=50", cookies });
    const actions = audit.json().events.map((event: { action: string }) => event.action);
    expect(actions).toEqual(expect.arrayContaining([
      "traffic_report.created",
      "traffic_report.updated",
      "traffic_report.deleted"
    ]));
  });
});
