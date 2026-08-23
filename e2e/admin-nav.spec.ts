import { test, expect } from "./fixtures";

test("official admin sidebar exposes implemented NodeBeacon pages", async ({ ownerPage: page }) => {
  const nav = page.locator(".km-admin-panel-nav");
  await expect(nav.getByRole("link", { name: "Server" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
  await expect(nav.getByText("XtermJS")).toHaveCount(0);
  await expect(nav.getByText("Reverse Proxy")).toHaveCount(0);

  await nav.getByRole("link", { name: "Server" }).click();
  await expect(page).toHaveURL(/\/admin\/servers/);
  await expect(page.locator(".km-admin-page")).toBeVisible();

  await nav.getByText("Settings", { exact: true }).click();
  await nav.getByRole("link", { name: "Theme Management" }).click();
  await expect(page).toHaveURL(/\/admin\/settings\/theme/);

  await nav.getByText("Notification", { exact: true }).click();
  await nav.getByRole("link", { name: "Offline" }).click();
  await expect(page).toHaveURL(/\/admin\/notification\/offline/);
});

test("mobile admin drawer remains usable", async ({ ownerPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/dashboard");
  await expect(page.locator(".km-admin-layout")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
