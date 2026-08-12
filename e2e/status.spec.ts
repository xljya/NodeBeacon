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

test("public status page shows a layout skeleton during the initial request", async ({ page }) => {
  let releaseStatus!: () => void;
  const statusGate = new Promise<void>((resolve) => { releaseStatus = resolve; });

  await page.route("**/api/status", async (route) => {
    await statusGate;
    await route.continue();
  });

  await page.goto("/");
  await expect(page.getByTestId("status-loading-skeleton")).toBeVisible();
  await expect(page.locator(".status-empty")).toHaveCount(0);

  releaseStatus();
  await expect(page.locator(".node-card")).toHaveCount(5);
  await expect(page.getByTestId("status-loading-skeleton")).toHaveCount(0);
});

test("public status page matches the persisted table view while loading", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("nb-view", "table"));

  let releaseStatus!: () => void;
  const statusGate = new Promise<void>((resolve) => { releaseStatus = resolve; });
  await page.route("**/api/status", async (route) => {
    await statusGate;
    await route.continue();
  });

  await page.goto("/");
  const skeleton = page.getByTestId("status-loading-skeleton");
  await expect(skeleton).toBeVisible();
  await expect(skeleton.getByTestId("status-skeleton-table")).toBeVisible();
  await expect(skeleton.getByTestId("status-skeleton-row")).toHaveCount(5);

  releaseStatus();
  await expect(page.locator(".node-table")).toBeVisible();
  await expect(skeleton).toHaveCount(0);
});

test("search shortcut, group and view preferences remain keyboard-friendly and persistent", async ({ page }) => {
  await page.goto("/");
  const search = page.getByPlaceholder(/Search nodes/);
  await expect(search).toBeVisible();
  await page.keyboard.press("/");
  await expect(search).toBeFocused();
  await search.fill("RS1000");
  await expect(page.locator(".node-card")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(search).toHaveValue("");
  await expect(search).not.toBeFocused();

  await page.getByRole("button", { name: "Core", exact: true }).click();
  await expect(page.locator(".node-card")).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Core", exact: true })).toHaveClass(/active/);
  await expect(page.locator(".node-card")).toHaveCount(1);

  await page.getByTitle("Table").click();
  await expect(page.locator(".node-table")).toBeVisible();
  await page.reload();
  await expect(page.locator(".node-table")).toBeVisible();
});

test("table view sorts and expands nodes using real public detail data", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("nb-view", "table"));
  await page.route("**/api/public/nodes/*/series?**", async (route) => {
    await route.fulfill({
      json: {
        nodeId: "rs1000",
        from: "2026-08-12T00:00:00.000Z",
        to: "2026-08-13T00:00:00.000Z",
        dataFrom: "2026-08-12T00:00:00.000Z",
        dataTo: "2026-08-13T00:00:00.000Z",
        stepSeconds: 300,
        aggregation: "avg",
        series: [{ metric: "latency", key: "ping", unit: "milliseconds", points: [[1, 20], [2, 23], [3, 18]] }]
      }
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Node", exact: true }).click();
  const expand = page.getByRole("button", { name: /Expand/ }).first();
  await expand.click();
  await expect(page.locator(".node-row-detail")).toBeVisible();
  await expect(page.getByLabel("24 hour latency trend")).toContainText("24h latency");
  await expect(page.getByRole("img", { name: "Latency trend" })).toBeVisible();
});

test("appearance migrates safely and follows the system color scheme", async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("appearance-migration-seeded")) {
      localStorage.removeItem("nb-appearance-v1");
      localStorage.setItem("nb-theme", "dark");
      sessionStorage.setItem("appearance-migration-seeded", "1");
    }
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("nb-appearance-v1") ?? "{}").mode)).toBe("dark");
  await page.getByTitle("Theme").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("nb-appearance-v1") ?? "{}").mode)).toBe("light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("corrupt appearance storage falls back without breaking mobile layout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem("nb-appearance-v1", "not-json"));
  await page.goto("/");
  await expect(page.locator(".node-card")).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("mobile loading skeleton is static for reduced-motion users", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });

  let releaseStatus!: () => void;
  const statusGate = new Promise<void>((resolve) => { releaseStatus = resolve; });
  await page.route("**/api/status", async (route) => {
    await statusGate;
    await route.continue();
  });

  await page.goto("/");
  const skeleton = page.getByTestId("status-loading-skeleton");
  await expect(skeleton).toBeVisible();
  const blocks = skeleton.locator(".status-skeleton-block");
  const blockCount = await blocks.count();
  expect(blockCount).toBeGreaterThan(0);
  await expect(blocks.nth(0)).toHaveCSS("animation-name", "none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  releaseStatus();
  await expect(page.locator(".node-card")).toHaveCount(5);
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
