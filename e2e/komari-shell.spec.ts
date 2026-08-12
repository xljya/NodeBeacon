import { expect, test } from "@playwright/test";

const PUBLIC_SHELL_URL = "http://localhost:3001";

test.describe("Komari-derived public shell", () => {
  test("renders NodeBeacon status without RPC2 and preserves search/view preferences", async ({ page }) => {
    const rpcRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/rpc2")) rpcRequests.push(request.url());
    });

    await page.goto(`${PUBLIC_SHELL_URL}/`);
    await expect(page.locator(".km-page-index")).toBeVisible();
    await expect(page.locator(".km-node-card")).toHaveCount(5);
    await expect(page.locator(".km-navbar-brand")).toContainText("NodeBeacon");

    await page.keyboard.press("/");
    const search = page.locator(".search-box input");
    await expect(search).toBeFocused();
    await search.fill("rs1000");
    await expect(page.locator(".km-node-card")).toHaveCount(1);
    await search.fill("");

    await page.locator(".view-switch-button").nth(1).click();
    await expect(page.locator(".km-node-table")).toBeVisible();
    await page.reload();
    await expect(page.locator(".km-node-table")).toBeVisible();
    expect(rpcRequests).toEqual([]);
  });

  test("routes node details and owner pages to the existing secure shell", async ({ page }) => {
    await page.goto(`${PUBLIC_SHELL_URL}/`);
    await page.locator('a[href^="/instance/"]').first().click();
    await expect(page).toHaveURL(/\/nodes\/[^/]+$/);
    await expect(page.locator(".detail-main-content")).toBeVisible();

    await page.goto(`${PUBLIC_SHELL_URL}/admin`);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator("form")).toBeVisible();
  });

  test("fits the mobile viewport without horizontal page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${PUBLIC_SHELL_URL}/`);
    await expect(page.locator(".km-node-card")).toHaveCount(5);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
