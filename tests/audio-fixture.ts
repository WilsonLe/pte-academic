import { expect, type Page } from "@playwright/test";

/** Isolated saved review: real source media, no speech inference or learner data. */
export async function openAudioReview(page: Page, base = "/") {
  await page.goto(base);
  await page.evaluate(async () => {
    const result = {
      id: "audio-handoff",
      label: "Listening practice",
      date: new Date().toISOString(),
      questionIds: ["summarize-spoken-text-01"],
      answers: {
        "summarize-spoken-text-01": { text: "Saved listening response." },
      },
      finished: true,
    };
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("pte-studio", 2);
      request.onupgradeneeded = () => {
        for (const name of ["attempts", "progress"])
          if (!request.result.objectStoreNames.contains(name))
            request.result.createObjectStore(name);
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("attempts", "readwrite");
        tx.objectStore("attempts").put({ result, recordings: {} }, result.id);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
    localStorage.setItem(
      "pte-studio-history-v1",
      JSON.stringify([{ ...result, answers: {} }]),
    );
  });
  await page.goto(base + "history/audio-handoff");
  await expect(
    page.getByRole("button", { name: "Play Prompt recording", exact: true }),
  ).toBeVisible();
}

export const promptAudio = (page: Page) =>
  page
    .getByRole("group", { name: "Prompt recording", exact: true })
    .locator("audio");
export const mediaState = (page: Page) =>
  promptAudio(page).evaluate((node: HTMLAudioElement) => ({
    paused: node.paused,
    time: node.currentTime,
    duration: node.duration,
  }));
export async function playPrompt(page: Page) {
  await page
    .getByRole("button", { name: "Play Prompt recording", exact: true })
    .click();
  await expect
    .poll(async () => (await mediaState(page)).time)
    .toBeGreaterThan(0);
}

export async function verifyAudioHandoff(page: Page, peer: Page, base = "/") {
  await openAudioReview(page, base);
  await peer.goto(base + "history/audio-handoff");
  await playPrompt(page);
  const before = await mediaState(page);
  await playPrompt(peer);
  await expect
    .poll(async () => (await mediaState(page)).paused, { timeout: 1500 })
    .toBe(true);
  const paused = await mediaState(page);
  expect(paused.time).toBeGreaterThanOrEqual(before.time);
  expect(paused.time).toBeLessThan(paused.duration - 1);
  const peerTime = (await mediaState(peer)).time;
  await expect
    .poll(async () => (await mediaState(peer)).time)
    .toBeGreaterThan(peerTime + 0.2);
  expect((await mediaState(page)).time).toBe(paused.time);
  await playPrompt(page);
  await expect.poll(async () => (await mediaState(peer)).paused).toBe(true);
  expect((await mediaState(page)).time).toBeGreaterThanOrEqual(paused.time);
  await peer.close();
  expect((await mediaState(page)).paused).toBe(false);
  await page
    .getByRole("button", { name: "Pause Prompt recording", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByText("Saved listening response.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".xp-chip")).toHaveAttribute(
    "aria-label",
    "0 XP, level 1. View progress",
  );
}
