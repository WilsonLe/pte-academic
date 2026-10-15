import { test, expect } from "@playwright/test";
test("subdirectory static build retains manifest, audio and offline navigation", async ({
  page,
  context,
}) => {
  await page.goto("http://127.0.0.1:4180/pte-academic/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Practice", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Question types", exact: true })
    .click();
  await expect(page.locator(".type-row").first()).toContainText("Read Aloud");
  await page.getByRole("searchbox").fill("Write from Dictation");
  await expect(page.locator(".type-row")).toHaveCount(1);
  await expect(page.locator(".type-row")).toContainText("Write from Dictation");
  await expect(page).toHaveURL(/\/pte-academic\/types$/);
  await page.reload();
  await expect(page.getByRole("searchbox")).toBeVisible();
  const audio = await page.evaluate(async () => {
    const r = await fetch("/pte-academic/audio/repeat-sentence-01.mp3", {
      headers: { Range: "bytes=0-127" },
    });
    return {
      status: r.status,
      length: (await r.arrayBuffer()).byteLength,
      range: r.headers.get("content-range"),
    };
  });
  expect(audio.status).toBe(206);
  expect(audio.length).toBe(128);
  expect(audio.range).toMatch(/^bytes 0-127\//);
});
