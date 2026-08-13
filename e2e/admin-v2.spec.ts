import { expect, test } from "@playwright/test";
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from "../playwright.config";
import { OWNER_STORAGE_STATE } from "./authState";

const PUBLIC_SHELL_URL = "http://localhost:3001";

test.describe("Komari Admin", () => {
  test("sends an unauthenticated deep link to a sanitized login next path", async ({ page }) => {
    const unauthorized: string[] = [];
    const rpcRequests: string[] = [];
    page.on("response", (response) => {
      if (response.status() === 401) unauthorized.push(response.url());
    });
    page.on("request", (request) => {
      if (request.url().includes("/api/rpc2")) rpcRequests.push(request.url());
    });

    await page.addInitScript(() => {
      window.localStorage.setItem("language", "en-US");
    });
    await page.goto(`${PUBLIC_SHELL_URL}/admin/servers`);
    await expect(page).toHaveURL(/\/login\?next=/);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/admin/servers");
    await expect(page.locator(".km-login-card")).toBeVisible();
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.getByRole("button", { name: "Login with GitHub" })).toHaveCount(0);
    expect(unauthorized).toEqual([]);
    expect(rpcRequests).toEqual([]);
  });

  test("signs in through login and returns to the requested admin page", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("language", "en-US");
    });
    await page.goto(`${PUBLIC_SHELL_URL}/login?next=${encodeURIComponent("/admin/dashboard")}`);
    await page.getByLabel("Username").fill(E2E_OWNER_EMAIL);
    await page.getByLabel("Password").fill(E2E_OWNER_PASSWORD);
    await page.getByRole("button", { name: "Login" }).click();
    await page.waitForURL("**/admin/dashboard");
    await expect(page.locator(".km-admin-page")).toBeVisible();
    await expect(page.getByText("Prometheus", { exact: true })).toBeVisible();
  });

  test("owner session can open the official shell without RPC2 or overflow", async ({ browser }) => {
    const context = await browser.newContext({ storageState: OWNER_STORAGE_STATE });
    const page = await context.newPage();
    const rpcRequests: string[] = [];
    const consoleErrors: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/rpc2")) rpcRequests.push(request.url());
    });
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.addInitScript(() => {
      window.localStorage.setItem("language", "en-US");
    });
    await page.goto(`${PUBLIC_SHELL_URL}/admin/dashboard`);
    await expect(page.locator(".km-admin-layout")).toBeVisible();
    await expect(page.getByText("Dashboard", { exact: true }).first()).toBeVisible();
    await page.getByRole("link", { name: "Server" }).click();
    await expect(page).toHaveURL(/\/admin\/servers/);
    await expect(page.locator(".km-admin-page")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${PUBLIC_SHELL_URL}/admin/dashboard`);
    await expect(page.locator(".km-admin-layout")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    expect(rpcRequests).toEqual([]);
    expect(consoleErrors.filter((item) => !item.includes("favicon"))).toEqual([]);
    await context.close();
  });

  test("requires explicit confirmation before deleting a server", async ({ browser }) => {
    const context = await browser.newContext({ storageState: OWNER_STORAGE_STATE });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.localStorage.setItem("language", "en-US");
    });
    await page.goto(`${PUBLIC_SHELL_URL}/admin/servers`);
    const firstRow = page.locator("tbody tr").first();
    const serverName = (await firstRow.locator("td").nth(1).innerText()).trim();
    await firstRow.getByTitle("Delete").click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(serverName);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(serverName, { exact: true })).toBeVisible();
    await context.close();
  });

  test("redirects retired shadow routes to the official paths", async ({ browser }) => {
    const anonymousContext = await browser.newContext();
    const anonymous = await anonymousContext.newPage();
    await anonymous.goto(`${PUBLIC_SHELL_URL}/login-v2?next=${encodeURIComponent("/admin-v2/dashboard")}`);
    await expect(anonymous).toHaveURL(/\/login\?next=/);
    await anonymousContext.close();

    const context = await browser.newContext({ storageState: OWNER_STORAGE_STATE });
    const page = await context.newPage();
    await page.goto(`${PUBLIC_SHELL_URL}/admin-v2/servers?tab=online`);
    await expect(page).toHaveURL(/\/admin\/servers\?tab=online$/);
    await expect(page.locator(".km-admin-page")).toBeVisible();
    await context.close();
  });
});
