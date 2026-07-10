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

test("logout returns to the login page", async ({ ownerPage }) => {
  await ownerPage.getByRole("button", { name: "Sign out" }).click();
  await ownerPage.waitForURL("**/login");
  await expect(ownerPage.getByRole("heading", { name: "NodeBeacon" })).toBeVisible();
});
