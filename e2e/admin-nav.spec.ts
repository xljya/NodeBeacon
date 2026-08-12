import { test, expect } from "./fixtures";

test("node management uses the unified responsive Komari-style theme", async ({ ownerPage: page }) => {
  await page.setViewportSize({ width: 2048, height: 900 });
  await expect(page.getByRole("heading", { name: "Node list" })).toBeVisible();
  await expect(page.locator(".komari-admin")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("heading", { name: "Node list" })).toHaveCSS("font-size", "22px");
  await expect(page.locator(".komari-search")).toHaveCSS("width", "182px");
  await expect(page.locator(".komari-search")).toHaveCSS("height", "36px");
  await expect(page.locator(".komari-table-wrap")).toHaveCSS("width", "1776px");
  await expect(page.locator(".komari-table th").first()).toHaveCSS("height", "40px");
  await expect(page.locator(".komari-table td").first()).toHaveCSS("height", "48.5px");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator(".komari-admin")).toHaveAttribute("data-theme", "dark");
});

test("migrates the persisted legacy admin theme and respects later choices", async ({ ownerPage: page }) => {
  await page.evaluate(() => {
    window.localStorage.setItem("nb-admin-theme", "light");
    window.localStorage.removeItem("nb-theme");
    window.localStorage.removeItem("nb-appearance-v1");
  });
  await page.reload();

  await expect(page.locator(".komari-admin")).toHaveAttribute("data-theme", "light");

  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator(".komari-admin")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator(".komari-admin")).toHaveAttribute("data-theme", "dark");
});

test("sidebar follows the compact Komari menu structure", async ({ ownerPage: page }) => {
  const nav = page.getByRole("navigation", { name: "Admin console" });
  const sidebarBox = await page.locator(".admin-sidebar").boundingBox();
  expect(Math.round(sidebarBox?.width ?? 0)).toBe(240);
  await expect(nav.getByText("Monitor", { exact: true })).toHaveCount(0);
  await expect(nav.getByText("Manage", { exact: true })).toHaveCount(0);

  const settings = page.getByRole("button", { name: "Settings", exact: true });
  const notification = page.getByRole("button", { name: "Notification", exact: true });
  await expect(settings).toHaveAttribute("aria-expanded", "false");
  await settings.click();
  await expect(settings).toHaveAttribute("aria-expanded", "true");
  await expect(settings).not.toHaveClass(/active/);
  await expect(settings).toHaveCSS("min-height", "40px");
  await expect(settings).toHaveCSS("border-radius", "6px");
  await expect(page.getByRole("link", { name: "Theme Management" })).toBeVisible();

  await notification.click();
  await expect(notification).toHaveAttribute("aria-expanded", "true");
  const labels = await nav.locator("a.admin-nav-item, button.admin-nav-item").evaluateAll((elements) =>
    elements.map((element) => element.textContent?.replace(/\s+/g, " ").trim())
  );
  expect(labels).toEqual([
    "Server",
    "Overview",
    "Settings",
    "Site",
    "Theme Management",
    "Sign-In",
    "Notifications",
    "General",
    "XtermJS",
    "Reverse Proxy",
    "Metrics Database",
    "Notification",
    "Offline",
    "Load",
    "Traffic Report",
    "General",
    "Remote Exec",
    "Latency",
    "Sessions",
    "Account",
    "Logs",
    "About",
    "Documentation",
    "Home",
    "Default Theme Settings"
  ]);
});

test("sidebar links navigate to their admin pages", async ({ ownerPage: page }) => {
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/overview$/);
  await page.getByRole("link", { name: "Server", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // "Settings" and "Notification" are nested-group toggle buttons, not links.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("link", { name: "Theme Management" }).click();
  await expect(page).toHaveURL(/\/admin\/settings\/theme/);

  await page.getByRole("button", { name: "Notification", exact: true }).click();
  await page.getByRole("link", { name: "Offline" }).click();
  await expect(page).toHaveURL(/\/admin\/notification\/offline/);

  await page.getByRole("link", { name: "Default Theme Settings" }).click();
  await expect(page).toHaveURL(/\/admin\/theme\/default$/);

  await page.getByRole("link", { name: "Server", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Node list" })).toBeVisible();
});

test("sidebar route expansion and mobile drawer remain accessible", async ({ ownerPage: page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open menu" }).click();
  const sidebar = page.locator(".admin-sidebar");
  await expect(sidebar).toHaveClass(/open/);
  const mobileSidebarBox = await sidebar.boundingBox();
  expect(Math.round(mobileSidebarBox?.width ?? 0)).toBe(264);
  await expect(page.getByRole("link", { name: "Server", exact: true })).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(sidebar).not.toHaveClass(/open/);
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/settings/theme");
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  const notification = page.getByRole("button", { name: "Notification", exact: true });
  await expect(settings).toHaveAttribute("aria-expanded", "true");
  await expect(notification).toHaveAttribute("aria-expanded", "false");
  await notification.click();
  await page.getByRole("link", { name: "Offline" }).click();
  await expect(settings).toHaveAttribute("aria-expanded", "false");
  await expect(notification).toHaveAttribute("aria-expanded", "true");
});
