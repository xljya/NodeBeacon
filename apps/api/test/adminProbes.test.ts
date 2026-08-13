import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, loginOwner } from "./helpers.js";
import { CHINA_ISP_DEFAULT_PROVINCE_CODES } from "../src/services/chinaIspPingCatalog.js";

describe("admin China ISP ping probes", () => {
  let app: FastifyInstance;
  let cookies: Record<string, string>;

  beforeAll(async () => {
    app = await buildTestApp();
    cookies = await loginOwner(app);
  });
  afterAll(() => app.close());

  it("rejects catalog and batch routes without a session", async () => {
    const catalog = await app.inject({ method: "GET", url: "/api/admin/probes/catalog" });
    const batch = await app.inject({
      method: "POST",
      url: "/api/admin/probes/batch",
      payload: { provinces: ["bj"], carriers: ["ct"], ipFamilies: ["v4"] }
    });
    expect(catalog.statusCode).toBe(401);
    expect(batch.statusCode).toBe(401);
  });

  it("returns the allow-listed catalog to the owner", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/probes/catalog", cookies });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.domain).toBe("zstaticcdn.com");
    expect(body.provinces).toHaveLength(31);
    expect(body.defaultProvinceCodes).toHaveLength(20);
  });

  it("creates, skips duplicates, and deletes matching TCP probes in one transaction", async () => {
    const payload = {
      provinces: ["xj", "gd"],
      carriers: ["ct", "cm"],
      ipFamilies: ["v4"]
    };
    const created = await app.inject({ method: "POST", url: "/api/admin/probes/batch", cookies, payload });
    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({ created: 4, skipped: 0, total: 4, reconciled: false });

    const duplicate = await app.inject({ method: "POST", url: "/api/admin/probes/batch", cookies, payload });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toMatchObject({ created: 0, skipped: 4, total: 4 });

    const listed = await app.inject({ method: "GET", url: "/api/admin/probes", cookies });
    const probes = listed.json().probes as Array<{ name: string; protocol: string; source?: string; target: string }>;
    expect(probes.some((probe) => probe.target === "xj-ct-v4.ip.zstaticcdn.com:80" && probe.name === "新疆电信 IPv4" && probe.source === "china_isp")).toBe(true);
    expect(probes.every((probe) => probe.protocol === "tcp")).toBe(true);

    const removed = await app.inject({
      method: "POST",
      url: "/api/admin/probes/batch/delete",
      cookies,
      payload
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toMatchObject({ deleted: 4 });
  });

  it("rejects unknown catalog codes", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/probes/batch",
      cookies,
      payload: { provinces: ["not-a-province"], carriers: ["ct"], ipFamilies: ["v4"] }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_probe");
  });

  it("returns empty live results without Prometheus", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/probes/results", cookies });
    expect(res.statusCode).toBe(200);
    expect(res.json().probes).toEqual([]);
  });

  it("keeps a manual TCP probe when batch-deleting the matching catalog target", async () => {
    const payload = { provinces: ["bj"], carriers: ["ct"], ipFamilies: ["v4"] };
    const manual = await app.inject({
      method: "POST",
      url: "/api/admin/probes",
      cookies,
      payload: { name: "hand-written", protocol: "tcp", target: "bj-ct-v4.ip.zstaticcdn.com:80" }
    });
    expect(manual.statusCode).toBe(200);

    const removed = await app.inject({
      method: "POST",
      url: "/api/admin/probes/batch/delete",
      cookies,
      payload
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toMatchObject({ deleted: 0 });

    const listed = await app.inject({ method: "GET", url: "/api/admin/probes", cookies });
    const probes = listed.json().probes as Array<{ name: string; target: string; source?: string }>;
    const kept = probes.find((probe) => probe.target === "bj-ct-v4.ip.zstaticcdn.com:80");
    expect(kept).toMatchObject({ name: "hand-written", source: "manual" });
  });

  it("rejects changing an enabled IPv4 probe onto a full IPv6 family", async () => {
    for (let index = 0; index < 100; index += 1) {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/probes",
        cookies,
        payload: { name: `v6-${index}`, protocol: "tcp", target: `full-${index}-v6.example.com:80` }
      });
      expect(res.statusCode).toBe(200);
    }
    const ipv4 = await app.inject({
      method: "POST",
      url: "/api/admin/probes",
      cookies,
      payload: { name: "switch-me", protocol: "tcp", target: "switch-me.example.com:80" }
    });
    expect(ipv4.statusCode).toBe(200);
    const patched = await app.inject({
      method: "PATCH",
      url: `/api/admin/probes/${ipv4.json().id}`,
      cookies,
      payload: { target: "switch-me-v6.example.com:80" }
    });
    expect(patched.statusCode).toBe(400);
    expect(patched.json().error.code).toBe("probe_limit");
  });

  it("exposes a reconcile retry that does not create extra tasks", async () => {
    const listed = await app.inject({ method: "GET", url: "/api/admin/probes", cookies });
    const before = (listed.json().probes as unknown[]).length;
    const res = await app.inject({ method: "POST", url: "/api/admin/probes/reconcile", cookies, payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ reconciled: false });
    const after = await app.inject({ method: "GET", url: "/api/admin/probes", cookies });
    expect((after.json().probes as unknown[]).length).toBe(before);
  });

  it("refuses a batch that would exceed the per-family TCP cap", async () => {
    for (let index = 0; index < 50; index += 1) {
      const res = await app.inject({
        method: "POST",
        url: "/api/admin/probes",
        cookies,
        payload: { name: `cap-${index}`, protocol: "tcp", target: `cap-${index}.example.com:80` }
      });
      expect(res.statusCode).toBe(200);
    }
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/probes/batch",
      cookies,
      payload: {
        provinces: [...CHINA_ISP_DEFAULT_PROVINCE_CODES],
        carriers: ["cm", "cu", "ct"],
        ipFamilies: ["v4"]
      }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("probe_limit");
  });
});
