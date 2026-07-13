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

test("dragging a node previews displaced rows before saving the new order", async ({ ownerPage: page }) => {
  const originalResponse = await page.request.get("/api/admin/nodes");
  const originalNodes = (await originalResponse.json()).nodes as Array<{ id: string; name: string }>;
  const originalIds = originalNodes.map((node) => node.id);
  const expectedNames = [originalNodes[1].name, originalNodes[2].name, originalNodes[0].name];
  const rows = page.locator(".komari-table tbody tr");
  const names = page.locator(".komari-table tbody .node-name-button");
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());

  try {
    await rows.nth(0).dispatchEvent("dragstart", { dataTransfer });
    await rows.nth(2).dispatchEvent("dragover", { dataTransfer });

    // The browser has not emitted drop yet: this assertion specifically checks
    // the live gap/preview behavior, not only the persisted server response.
    await expect(names.nth(0)).toHaveText(expectedNames[0]);
    await expect(names.nth(1)).toHaveText(expectedNames[1]);
    await expect(names.nth(2)).toHaveText(expectedNames[2]);

    const saved = page.waitForResponse(
      (response) => response.request().method() === "PATCH" && response.url().endsWith("/api/admin/nodes/order")
    );
    await page.locator("tr.node-row-dragging").dispatchEvent("drop", { dataTransfer });
    expect((await saved).status()).toBe(200);
  } finally {
    await page.request.patch("/api/admin/nodes/order", { data: { ids: originalIds } });
    await dataTransfer.dispose();
  }
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
