import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, loginOwner } from "./helpers.js";

/** 0.7.0 write-path hardening: mutex, atomic save, corrupt fallback, reorder. */

function registryYaml(ids: string[]): string {
  const blocks = ids.map((id, index) =>
    [
      `  - id: ${id}`,
      `    name: ${id.toUpperCase()}`,
      "    provider: test",
      "    group: Lab",
      "    region: Test",
      `    displayOrder: ${(index + 1) * 10}`,
      "    public: true",
      "    labels:",
      "      job: node-exporter"
    ].join("\n")
  );
  return `nodes:\n${blocks.join("\n")}\n`;
}

describe("node registry write path", () => {
  let dir: string;
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
    await rm(dir, { recursive: true, force: true });
  });

  async function setup(ids: string[], overrides: Record<string, string> = {}) {
    dir = await mkdtemp(join(tmpdir(), "nodebeacon-registry-"));
    const registryPath = join(dir, "nodes.yaml");
    await writeFile(registryPath, registryYaml(ids), "utf8");
    app = await buildTestApp({ NODEBEACON_NODE_CONFIG: registryPath, ...overrides });
    const cookies = await loginOwner(app);
    return { registryPath, cookies, app };
  }

  it("keeps both fields when two PATCHes race (registry lock)", async () => {
    const { registryPath, cookies, app } = await setup(["alpha", "beta"]);

    const [first, second] = await Promise.all([
      app.inject({
        method: "PATCH",
        url: "/api/admin/nodes/alpha",
        cookies,
        payload: { group: "GroupAlpha" }
      }),
      app.inject({
        method: "PATCH",
        url: "/api/admin/nodes/beta",
        cookies,
        payload: { group: "GroupBeta" }
      })
    ]);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);

    // Without the lock, the second load-modify-save clobbers the first write.
    const content = await readFile(registryPath, "utf8");
    expect(content).toContain("GroupAlpha");
    expect(content).toContain("GroupBeta");
  });

  it("rotates a .bak.1 snapshot on save", async () => {
    const { registryPath, cookies, app } = await setup(["alpha"]);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/nodes/alpha",
      cookies,
      payload: { group: "Changed" }
    });
    expect(res.statusCode).toBe(200);

    await expect(access(`${registryPath}.bak.1`)).resolves.toBeUndefined();
    // The backup holds the pre-save content.
    expect(await readFile(`${registryPath}.bak.1`, "utf8")).toContain("group: Lab");
  });

  it("applies a full permutation through PATCH /api/admin/nodes/order", async () => {
    const { registryPath, cookies, app } = await setup(["alpha", "beta", "gamma"]);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/nodes/order",
      cookies,
      payload: { ids: ["gamma", "alpha", "beta"] }
    });
    expect(res.statusCode).toBe(200);
    const { nodes } = res.json();
    expect(nodes.map((node: { id: string }) => node.id)).toEqual(["gamma", "alpha", "beta"]);
    expect(nodes.map((node: { displayOrder: number }) => node.displayOrder)).toEqual([10, 20, 30]);

    const content = await readFile(registryPath, "utf8");
    expect(content.indexOf("id: gamma")).toBeLessThan(content.indexOf("id: alpha"));
  });

  it("rejects a reorder that is not a permutation of all node ids", async () => {
    const { cookies, app } = await setup(["alpha", "beta"]);

    const missing = await app.inject({
      method: "PATCH",
      url: "/api/admin/nodes/order",
      cookies,
      payload: { ids: ["alpha"] }
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().error.code).toBe("invalid_order");

    const unknown = await app.inject({
      method: "PATCH",
      url: "/api/admin/nodes/order",
      cookies,
      payload: { ids: ["alpha", "nope"] }
    });
    expect(unknown.statusCode).toBe(400);
  });

  it("serves the seed registry when the runtime file is corrupt", async () => {
    dir = await mkdtemp(join(tmpdir(), "nodebeacon-registry-"));
    const corruptPath = join(dir, "nodes.yaml");
    const seedPath = join(dir, "seed.yaml");
    await writeFile(corruptPath, "nodes: [ {{{ definitely not yaml", "utf8");
    await writeFile(seedPath, registryYaml(["seeded"]), "utf8");

    app = await buildTestApp({
      NODEBEACON_NODE_CONFIG: corruptPath,
      NODEBEACON_NODE_CONFIG_SEED: seedPath
    });

    // A corrupt runtime file must degrade to the seed, not 500 the status page.
    const res = await app.inject({ method: "GET", url: "/api/status" });
    expect(res.statusCode).toBe(200);
    expect(res.json().nodes.map((node: { id: string }) => node.id)).toEqual(["seeded"]);
  });
});

describe("origin backstop on mutating requests", () => {
  let dir: string;
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (app) await app.close();
    app = null;
    await rm(dir, { recursive: true, force: true });
  });

  async function setup() {
    dir = await mkdtemp(join(tmpdir(), "nodebeacon-origin-"));
    const registryPath = join(dir, "nodes.yaml");
    await writeFile(registryPath, registryYaml(["alpha"]), "utf8");
    app = await buildTestApp({ NODEBEACON_NODE_CONFIG: registryPath });
    const cookies = await loginOwner(app);
    return { cookies, app };
  }

  it("rejects a mutating request with a foreign Origin", async () => {
    const { cookies, app } = await setup();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/nodes/alpha",
      cookies,
      headers: { origin: "https://evil.example" },
      payload: { group: "Hacked" }
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("origin_mismatch");
  });

  it("allows a mutating request from the configured web origin", async () => {
    const { cookies, app } = await setup();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/nodes/alpha",
      cookies,
      headers: { origin: "http://localhost:5173" },
      payload: { group: "Legit" }
    });
    expect(res.statusCode).toBe(200);
  });

  it("allows a mutating request whose Origin matches the request host", async () => {
    const { cookies, app } = await setup();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/nodes/alpha",
      cookies,
      headers: { origin: "http://127.0.0.1:5174", host: "127.0.0.1:5174" },
      payload: { group: "Legit" }
    });
    expect(res.statusCode).toBe(200);
  });

  it("allows a mutating request without an Origin header", async () => {
    const { cookies, app } = await setup();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/nodes/alpha",
      cookies,
      payload: { group: "NoOrigin" }
    });
    expect(res.statusCode).toBe(200);
  });
});
