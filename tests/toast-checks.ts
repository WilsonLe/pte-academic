import { expect, type Locator, type Page } from "@playwright/test";

// Check the receipt while it is present, rather than allowing a click to wait
// through its lifetime and accidentally hide an obstruction.
export async function receiptLeavesControlsAvailable(
  page: Page,
  receipt: Locator,
) {
  await expect(receipt).toBeVisible();
  await expect(receipt).not.toBeFocused();
  const overlapsNavigation = () =>
    receipt.evaluate((toast) => {
      const r = toast.getBoundingClientRect();
      return [...document.querySelectorAll(".topbar, .mobile-nav")]
        .filter((n) => n.getClientRects().length)
        .some((n) => {
          const nav = n.getBoundingClientRect();
          return (
            r.left < nav.right &&
            r.right > nav.left &&
            r.top < nav.bottom &&
            r.bottom > nav.top
          );
        });
    });
  const blocked = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const controls = dialog
      ? dialog.querySelectorAll("button")
      : document.querySelectorAll(".topbar button, main button, .mobile-nav a");
    return [...controls]
      .filter((n) => {
        const r = n.getBoundingClientRect();
        return (
          n.getClientRects().length &&
          getComputedStyle(n).visibility !== "hidden" &&
          !n.matches(":disabled, [aria-disabled=true]") &&
          r.left >= 0 &&
          r.right <= innerWidth &&
          r.top >= 0 &&
          r.bottom <= innerHeight
        );
      })
      .filter((n) => {
        const r = n.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        );
        return !hit || !n.contains(hit);
      })
      .map((n) => n.getAttribute("aria-label") || n.textContent);
  });
  expect(blocked).toEqual([]);
  // Sonner briefly translates receipts into place. Pointer access must work
  // immediately above; the settled receipt must also leave navigation visible.
  await expect.poll(overlapsNavigation, { timeout: 1000 }).toBe(false);
  await expect(receipt).toBeVisible();
}
