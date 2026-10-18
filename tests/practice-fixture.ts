import { test as base } from "@playwright/test";

// Known-input runner contracts retain reproducible entropy in their isolated
// browser. Variation and retained-history behavior are exercised separately.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      Math.random = () => 0.999999;
    });
    await use(page);
  },
});
