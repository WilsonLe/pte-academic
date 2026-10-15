import { test, expect } from "@playwright/test";
test("subdirectory static build retains manifest, audio and offline navigation", async ({
  page,
  context,
}) => {
  await page.goto("http://127.0.0.1:4180/pte-academic/");
  await expect(
    page.getByRole("status", { name: "Offline ready", exact: true }),
  ).toBeVisible({
    timeout: 15000,
  });
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
  await expect(page.locator(".type-row")).toHaveCount(22);
  const audio = await page.evaluate(async () => {
    const r = await fetch("./audio/repeat-sentence-01.mp3", {
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
