import { test as setup } from "@playwright/test";
import { E2E_OWNER_EMAIL, E2E_OWNER_PASSWORD } from "../playwright.config";
import { OWNER_STORAGE_STATE } from "./authState";

setup("authenticate as owner", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("language", "en-US");
  });
  await page.goto("http://localhost:3001/login");
  await page.getByLabel("Username").fill(E2E_OWNER_EMAIL);
  await page.getByLabel("Password").fill(E2E_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Login", exact: true }).click();
  await page.waitForURL("**/admin/dashboard");
  await page.context().storageState({ path: OWNER_STORAGE_STATE });
});
