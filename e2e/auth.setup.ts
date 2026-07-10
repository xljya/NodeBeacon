import { test as setup } from "@playwright/test";
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from "../playwright.config";
import { OWNER_STORAGE_STATE } from "./authState";

setup("authenticate as owner", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Account (email)").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Password").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/admin");
  await page.context().storageState({ path: OWNER_STORAGE_STATE });
});
