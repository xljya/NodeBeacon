import { test, expect } from "./fixtures";
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from "../playwright.config";

test("owner can sign in and lands on the node list", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Account (email)").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Password").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("**/admin");
  await expect(page.getByRole("heading", { name: "Node list" })).toBeVisible();
});

test("shows the authenticator step only after credentials and supports recovery codes", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ error: { code: "unauthorized", message: "Not signed in" } }) });
  });
  await page.route("**/api/auth/config", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ passwordLoginEnabled: true, githubLoginEnabled: false }) });
  });
  await page.route("**/api/auth/challenge", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ required: false }) });
  });
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ status: "second_factor_required", methods: ["totp", "recovery_code"] })
    });
  });

  await page.goto("/login");
  await expect(page.getByLabel("Authenticator code")).toHaveCount(0);
  await page.getByLabel("Account (email)").fill("owner@example.com");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByLabel("Authenticator code")).toBeVisible();
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await page.getByRole("button", { name: "Use a recovery code" }).click();
  await expect(page.getByLabel("Recovery code")).toBeVisible();
  await expect(page.getByRole("button", { name: "Use an authenticator code" })).toBeVisible();
});

test("logout returns to the login page", async ({ ownerPage }) => {
  await ownerPage.getByRole("button", { name: "Sign out" }).click();
  await ownerPage.waitForURL("**/login");
  await expect(ownerPage.getByRole("heading", { name: "NodeBeacon" })).toBeVisible();
});
