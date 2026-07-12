import { test, expect } from "./fixtures";

test("node CRUD is isolated and recorded in the audit trail", async ({ ownerPage: page }) => {
  const node = {
    id: "e2e-node",
    name: "E2E node",
    provider: "test",
    group: "E2E",
    region: "local",
    public: false,
    labels: { job: "e2e" },
    tags: ["test"]
  };

  const created = await page.request.post("/api/admin/nodes", { data: node });
  expect(created.status()).toBe(200);
  expect((await created.json()).node.name).toBe("E2E node");

  const updated = await page.request.patch("/api/admin/nodes/e2e-node", {
    data: { name: "E2E node updated" }
  });
  expect(updated.status()).toBe(200);
  expect((await updated.json()).node.name).toBe("E2E node updated");

  const audit = await page.request.get("/api/admin/audit-events");
  expect(audit.status()).toBe(200);
  const actions = (await audit.json()).events.map((event: { action: string }) => event.action);
  expect(actions).toEqual(expect.arrayContaining(["node.created", "node.updated"]));

  const deleted = await page.request.delete("/api/admin/nodes/e2e-node");
  expect(deleted.status()).toBe(200);
});

test("API responses are no-store and another session can be revoked", async ({ ownerPage: page, playwright }) => {
  const status = await page.request.get("/api/status");
  expect(status.headers()["cache-control"]).toContain("no-store");

  const other = await playwright.request.newContext({ baseURL: "http://localhost:5173" });
  try {
    const login = await other.post("/api/auth/login", {
      data: { email: "owner@e2e.test", password: "e2e-test-password-123" }
    });
    expect(login.status()).toBe(200);

    const sessionsResponse = await page.request.get("/api/admin/sessions");
    const sessions = (await sessionsResponse.json()).sessions as Array<{ id: string; current: boolean }>;
    const otherSession = sessions.find((session) => !session.current);
    expect(otherSession).toBeTruthy();

    const revoked = await page.request.delete(`/api/admin/sessions/${otherSession!.id}`);
    expect(revoked.status()).toBe(200);
    expect((await other.get("/api/auth/me")).status()).toBe(401);
  } finally {
    await other.dispose();
  }
});
