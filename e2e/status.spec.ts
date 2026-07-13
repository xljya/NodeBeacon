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

test("login page is reachable and rejects bad credentials", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "NodeBeacon" })).toBeVisible();

  await page.getByLabel("Account (email)").fill("nobody@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.locator(".login-error")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
