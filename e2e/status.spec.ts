import { test, expect } from "./fixtures";

test("public status page renders without signing in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Current Time")).toBeVisible();
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
  await expect(page.locator(".detail-head")).toBeVisible();

  let delayStatus = true;
  await page.route("**/api/status", async (route) => {
    if (delayStatus) await new Promise((resolve) => setTimeout(resolve, 1_200));
    await route.continue();
  });

  await page.locator(".detail-back").click();
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
