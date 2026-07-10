import { test as base, expect, type Page } from "@playwright/test";
import { OWNER_STORAGE_STATE } from "./authState";

export { expect };

/** Forces English so assertions don't depend on the machine's browser locale. */
async function forceEnglish(page: Page) {
  await page.addInitScript(() => window.localStorage.setItem("nb-lang", "en"));
}

export const test = base.extend<{ ownerPage: Page }>({
  page: async ({ page }, use) => {
    await forceEnglish(page);
    await use(page);
  },
  // Reuses the session saved by auth.setup.ts instead of submitting the login
  // form again — real logins are rate-limited to 5/min in the API.
  ownerPage: async ({ browser }, use) => {
    const context = await browser.newContext({ storageState: OWNER_STORAGE_STATE });
    const page = await context.newPage();
    await forceEnglish(page);
    await page.goto("/admin");
    await use(page);
    await context.close();
  }
});
