import { test, expect } from "./fixtures";

test("public status page renders without signing in", async ({ page }) => {
  await page.goto("/");
  const githubLink = page.getByRole("link", { name: "GitHub" });
  await expect(githubLink).toHaveAttribute("href", "https://github.com/xljya/NodeBeacon");
  await expect(githubLink).toHaveAttribute("target", "_blank");
  await expect(page.getByText("Current Time")).toBeVisible();
  await expect(page.locator(".node-card", { hasText: "RS1000" }).locator(".node-flag")).toHaveText("🇺🇸");
  await expect(page.locator(".node-card", { hasText: "hostbrr-4t" }).locator(".node-flag")).toHaveText("🇩🇪");
});

test("Chinese selection sets the document language and typography stack", async ({ page }) => {
  await page.goto("/");
  await page.getByTitle("Language").click();
  await page.getByRole("option", { name: "简体中文 (zh)" }).click();

  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await expect(page.getByText("当前时间", { exact: true })).toBeVisible();
  await expect(page.locator(".stat-label").first()).toHaveCSS("font-family", /PingFang SC/);
  await expect(page.locator(".stat-value").first()).toHaveCSS("font-family", /ui-monospace/);
  await expect(page.locator(".status-login")).toHaveCSS("white-space", "nowrap");
});

test("English and Traditional Chinese use the matching Pigsty system stacks", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator(".status-page")).toHaveCSS("font-family", /-apple-system/);

  await page.getByTitle("Language").click();
  await page.getByRole("option", { name: "繁體中文 (zh-tw)" }).click();

  await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
  await expect(page.getByText("目前時間", { exact: true })).toBeVisible();
  await expect(page.locator(".stat-label").first()).toHaveCSS("font-family", /PingFang TC/);
  await expect(page.locator(".stat-value").first()).toHaveCSS("font-family", /ui-monospace/);

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
  await expect(page.getByText("目前時間", { exact: true })).toBeVisible();
  await expect(page.locator(".stat-label").first()).toHaveCSS("font-family", /PingFang TC/);
});

test("the whole node card opens its detail page and hides the live badge", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Live data", { exact: true })).toHaveCount(0);

  const card = page.locator(".node-card").first();
  const href = await card.getAttribute("href");
  expect(href).toMatch(/^\/nodes\/[^/]+$/);

  await card.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
});

test("returning from a node detail keeps the previous status snapshot visible", async ({ page }) => {
  await page.goto("/");
  const cards = page.locator(".node-card");
  await expect(cards).toHaveCount(5);

  await cards.first().click();
  await expect(page).toHaveURL(/\/nodes\/[^/]+$/);
  await expect(page.locator(".detail-node-identity")).toBeVisible();

  let delayStatus = true;
  await page.route("**/api/status", async (route) => {
    if (delayStatus) await new Promise((resolve) => setTimeout(resolve, 1_200));
    await route.continue();
  });

  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(cards).toHaveCount(5, { timeout: 300 });
  await expect(page.getByText("No servers configured", { exact: true })).toHaveCount(0);
  delayStatus = false;
});

test("login page is reachable and rejects bad credentials", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "NodeBeacon" })).toBeVisible();

  await page.getByLabel("Account (email)").fill("nobody@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.locator(".login-error")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
