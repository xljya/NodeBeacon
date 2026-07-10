import { test, expect } from "./fixtures";

test("sidebar links navigate to their admin pages", async ({ ownerPage: page }) => {
  // "Settings" and "Notification" are nested-group toggle buttons, not links.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Theme Management" }).click();
  await expect(page).toHaveURL(/\/admin\/settings\/theme/);

  await page.getByRole("button", { name: "Notification", exact: true }).click();
  await page.getByRole("link", { name: "Offline" }).click();
  await expect(page).toHaveURL(/\/admin\/notification\/offline/);

  await page.getByRole("link", { name: "Default Theme Settings" }).click();
  await expect(page).toHaveURL(/\/admin\/theme$/);

  await page.getByRole("link", { name: "Server", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Node list" })).toBeVisible();
});
