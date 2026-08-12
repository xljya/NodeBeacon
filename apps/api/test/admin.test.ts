import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, loginOwner, OWNER_EMAIL } from "./helpers.js";
import { generateTotpCode } from "../src/services/totpService.js";

describe("admin routes (owner-only)", () => {
  let app: FastifyInstance;
  let cookies: Record<string, string>;

  beforeAll(async () => {
    app = await buildTestApp();
    cookies = await loginOwner(app);
  });
  afterAll(() => app.close());

  it.each([
    "/api/admin/summary",
    "/api/admin/nodes",
    "/api/admin/users",
    "/api/admin/sessions",
    "/api/admin/audit-events",
    "/api/admin/alerts",
    "/api/admin/incidents"
  ])(
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

  it("stores only whitelisted versioned appearance tokens", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/admin/themes",
      cookies,
      payload: {
        name: "Unsafe theme input",
        tokens: {
          mode: "dark",
          accent: "teal",
          grayColor: "sand",
          radius: "large",
          scaling: "105%",
          panelBackground: "solid",
          css: "body{display:none}",
          html: "<script>alert(1)</script>",
          background: "javascript:alert(1)"
        }
      }
    });
    expect(created.statusCode).toBe(200);
    const theme = created.json();
    expect(theme.tokens).toEqual({
      version: 1,
      mode: "dark",
      accent: "teal",
      grayColor: "sand",
      radius: "large",
      scaling: "105%",
      panelBackground: "solid"
    });
    expect(theme.tokens).not.toHaveProperty("css");
    expect(theme.tokens).not.toHaveProperty("html");
    await app.inject({ method: "DELETE", url: `/api/admin/themes/${theme.id}`, cookies });
  });

  it("lists the env-provisioned owner account", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/users", cookies });
    expect(res.statusCode).toBe(200);
    expect(res.json().users).toEqual([{ id: "owner", email: OWNER_EMAIL, role: "owner" }]);
  });

  it("creates, updates and deletes node registry entries", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nodebeacon-admin-"));
    const registryPath = join(dir, "nodes.yaml");
    await writeFile(
      registryPath,
      [
        "nodes:",
        "  - id: seed",
        "    name: Seed",
        "    provider: test",
        "    group: Lab",
        "    region: Test",
        "    displayOrder: 10",
        "    public: true",
        "    labels:",
        "      job: node-exporter",
        "    tags:",
        "      - seed",
        ""
      ].join("\n"),
      "utf8"
    );

    const mutableApp = await buildTestApp({ NODEBEACON_NODE_CONFIG: registryPath });
    const mutableCookies = await loginOwner(mutableApp);

    try {
      const create = await mutableApp.inject({
        method: "POST",
        url: "/api/admin/nodes",
        cookies: mutableCookies,
        payload: {
          id: "new-node",
          name: "New Node",
          provider: "Test",
          group: "Edge",
          region: "US",
          countryCode: "de",
          displayOrder: 20,
          public: true,
          labels: { job: "external-vps-node", instance: "new-node" },
          tags: ["test"],
          ipAddress: "10.77.0.9:9100",
          clientVersion: "1.2.3",
          privateNotes: "owner-only",
          billing: { price: 6, currency: "USD", cycleDays: 30 },
          detail: {
            enabled: true,
            visibility: "safe",
            networkDevices: ["eth0"],
            diskMounts: ["/"],
            latencyVantages: ["rs1000"],
            profileOverride: { virtualization: "kvm" }
          }
        }
      });
      expect(create.statusCode).toBe(200);
      expect(create.json().node).toMatchObject({
        id: "new-node",
        group: "Edge",
        countryCode: "DE",
        detail: { enabled: true, visibility: "safe", networkDevices: ["eth0"] }
      });

      const update = await mutableApp.inject({
        method: "PATCH",
        url: "/api/admin/nodes/new-node",
        cookies: mutableCookies,
        payload: { group: "Core", privateNotes: "updated", detail: { visibility: "full", diskMounts: ["/", "/mnt/data"] } }
      });
      expect(update.statusCode).toBe(200);
      expect(update.json().node).toMatchObject({
        id: "new-node",
        group: "Core",
        privateNotes: "updated",
        detail: { visibility: "full", diskMounts: ["/", "/mnt/data"] }
      });

      const contentAfterUpdate = await readFile(registryPath, "utf8");
      expect(contentAfterUpdate).toContain("new-node");
      expect(contentAfterUpdate).toContain("privateNotes: updated");
      expect(contentAfterUpdate).toContain("/mnt/data");

      const remove = await mutableApp.inject({
        method: "DELETE",
        url: "/api/admin/nodes/new-node",
        cookies: mutableCookies
      });
      expect(remove.statusCode).toBe(200);
      expect(remove.json()).toEqual({ ok: true });
      expect(await readFile(registryPath, "utf8")).not.toContain("new-node");
    } finally {
      await mutableApp.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects invalid detail mutations", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/nodes/rs1000",
      cookies,
      payload: { detail: { visibility: "public" } }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("invalid_node");
  });

  it("requires reauthentication and refuses to replace an enabled factor", async () => {
    const wrong = await app.inject({ method: "POST", url: "/api/admin/2fa/setup", cookies, payload: { currentPassword: "wrong-password" } });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.code).toBe("reauthentication_required");

    const setup = await app.inject({ method: "POST", url: "/api/admin/2fa/setup", cookies, payload: { currentPassword: "test-password-123" } });
    expect(setup.statusCode).toBe(200);
    expect(setup.json().otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    const confirm = await app.inject({ method: "POST", url: "/api/admin/2fa/confirm", cookies, payload: { code: generateTotpCode(setup.json().secret) } });
    expect(confirm.statusCode).toBe(200);

    const duplicate = await app.inject({ method: "POST", url: "/api/admin/2fa/setup", cookies, payload: { currentPassword: "test-password-123" } });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe("totp_already_enabled");
  });
});
