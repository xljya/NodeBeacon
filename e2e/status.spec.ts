import { test, expect } from "./fixtures";

test("public status page renders without signing in", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".km-page-index")).toBeVisible();
  await expect(page.locator(".km-navbar-brand")).toContainText("NodeBeacon");
  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    page.locator(".km-navbar-controls button").first().click()
  ]);
  await expect(popup).toHaveURL("https://github.com/xljya/NodeBeacon");
  await popup.close();
  await expect(page.locator(".km-node-card")).toHaveCount(5);
});

test("Chinese selection sets the document language", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Language" }).click();
  await page.getByRole("menuitem", { name: "简体中文 (zh)" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
});

test("search shortcut, group and view preferences remain keyboard-friendly and persistent", async ({ page }) => {
  await page.goto("/");
  const search = page.locator(".search-box input");
  await expect(search).toBeVisible();
  await page.keyboard.press("/");
  await expect(search).toBeFocused();
  await search.fill("rs1000");
  await expect(page.locator(".km-node-card")).toHaveCount(1);
  await search.fill("");

  await page.locator(".view-switch-button").nth(1).click();
  await expect(page.locator(".km-node-table")).toBeVisible();
  await page.reload();
  await expect(page.locator(".km-node-table")).toBeVisible();
});

test("the node name opens the in-shell detail page", async ({ page }) => {
  await page.goto("/");
  await page.locator('.km-node-card a[href^="/nodes/"]').first().click();
  await expect(page).toHaveURL(/\/nodes\/[^/]+$/);
  await expect(page.locator('[data-page="node-detail"]')).toBeVisible();
});

test("appearance toggle persists after reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Appearance" }).click();
  await page.getByRole("menuitem", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("corrupt appearance storage falls back without breaking mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("nb-appearance-v1", "not-json"));
  await page.goto("/");
  await expect(page.locator(".km-node-card")).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("login page is reachable and rejects bad credentials", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator(".km-login-card")).toBeVisible();
  await page.getByLabel("Username").fill("nobody@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await expect(page.getByText("Invalid email or password.").first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
