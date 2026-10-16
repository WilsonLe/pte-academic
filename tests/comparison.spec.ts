import { test, expect, type Page } from "@playwright/test";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { COMPARISON_MODEL_SHA } from "../src/speech/comparison-schema";
const base = process.env.PTE_TEST_SUBPATH === "1" ? "/pte-academic/" : "/";
async function seed(page: Page, waitForModel = true) {
  await page.goto(base);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.evaluate(async () => {
    const recording = await (
      await fetch(new URL("audio/repeat-sentence-01.mp3", document.baseURI))
    ).blob();
    const result = {
      id: "comparison-fixture",
      label: "Repeat Sentence",
      date: new Date().toISOString(),
      questionIds: ["repeat-sentence-01"],
      answers: { "repeat-sentence-01": {} },
      finished: true,
    };
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open("pte-studio", 2);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains("attempts"))
          r.result.createObjectStore("attempts");
        if (!r.result.objectStoreNames.contains("progress"))
          r.result.createObjectStore("progress");
      };
      r.onerror = () => reject(r.error);
      r.onsuccess = () => {
        const db = r.result,
          tx = db.transaction("attempts", "readwrite");
        tx.objectStore("attempts").put(
          { result, recordings: { "repeat-sentence-01": recording } },
          result.id,
        );
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    localStorage.setItem(
      "pte-studio-history-v1",
      JSON.stringify([{ ...result, answers: {} }]),
    );
  });
  await page.goto(base + "history/comparison-fixture");
  await page
    .getByRole("button", { name: "Your response", exact: true })
    .click();
  if (waitForModel)
    await expect(
      page.getByRole("button", { name: "Score speech with v3 model" }),
    ).toBeEnabled({ timeout: 90000 });
}
async function workerPath() {
  return (
    base +
    "assets/" +
    (
      await readdir(
        process.env.PTE_TEST_SUBPATH === "1"
          ? "dist-subpath/assets"
          : "dist/assets",
      )
    ).find((f) => /^comparison\.worker-.*\.js$/.test(f))
  );
}
async function runWorker(page: Page, pcm: Buffer, text: string) {
  return await page.evaluate(
    async ({ data, text, workerPath, base }) => {
      const audio = new Float32Array(
        Uint8Array.from(atob(data), (c) => c.charCodeAt(0)).buffer,
      );
      const worker = new Worker(workerPath, { type: "module" });
      return await new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => {
          worker.terminate();
          reject(new Error("Worker verification timed out"));
        }, 60000);
        worker.onerror = (e) => {
          clearTimeout(timer);
          worker.terminate();
          reject(new Error(e.message));
        };
        worker.onmessage = (e) => {
          if (e.data.type === "complete") {
            clearTimeout(timer);
            worker.terminate();
            resolve(e.data.result);
          } else if (e.data.type === "error") {
            clearTimeout(timer);
            worker.terminate();
            reject(new Error(e.data.message));
          }
        };
        worker.postMessage(
          { audio, text, base: new URL(base, location.origin).href },
          [audio.buffer],
        );
      });
    },
    {
      data: pcm.toString("base64"),
      text,
      workerPath: await workerPath(),
      base,
    },
  );
}
test("actual v3 browser inference matches all four Python accent controls and wrong-sound targets", async ({
  page,
  context,
}, info) => {
  test.setTimeout(180000);
  const requests: { url: string; method: string; body: boolean }[] = [];
  context.on("request", (r) =>
    requests.push({
      url: r.url(),
      method: r.method(),
      body: !!r.postDataBuffer(),
    }),
  );
  await seed(page);
  const cases = JSON.parse(
    await readFile(
      "artifacts/pronunciation/browser-verification/cases.json",
      "utf8",
    ),
  );
  const reports = [];
  for (const c of cases) {
    const result = await runWorker(page, await readFile(c.pcm), c.text);
    expect(result.modelSha256).toBe(COMPARISON_MODEL_SHA);
    expect(result.syllables).toHaveLength(c.expected.syllables.length);
    let difference = 0;
    for (let i = 0; i < result.syllables.length; i++) {
      const a = result.syllables[i],
        b = c.expected.syllables[i];
      expect(a.status).toBe(b.status);
      if (b.similarity === null) expect(a.similarity).toBeNull();
      else {
        const d = Math.abs(a.similarity - b.similarity);
        expect(d).toBeLessThanOrEqual(0.1);
        difference = Math.max(difference, d);
      }
    }
    reports.push({
      name: c.name,
      maximumScoreDifference: difference,
      scored: result.syllables.filter((s: any) => s.status === "scored").length,
      syllables: result.syllables.length,
      target: result.syllables
        .filter((s: any) => s.word === "ship" || s.word === "sheep")
        .map((s: any) => s.similarity),
    });
  }
  const silence = await runWorker(page, Buffer.alloc(16000 * 4), "silence");
  expect(silence.status).toBe("no-reliable-speech");
  expect(silence.syllables).toEqual([]);
  let rng = 17;
  const noise = new Float32Array(16000);
  for (let i = 0; i < noise.length; i++) {
    rng = (Math.imul(rng, 1664525) + 1013904223) | 0;
    noise[i] = (rng / 2147483648) * 0.1;
  }
  expect(
    (await runWorker(page, Buffer.from(noise.buffer), "noise")).status,
  ).toBe("no-reliable-speech");
  expect(requests.filter((r) => r.body || r.method !== "GET")).toEqual([]);
  expect(requests.filter((r) => r.url.startsWith("https://"))).toEqual([]);
  await info.attach("v3-browser-parity", {
    body: JSON.stringify(reports, null, 2),
    contentType: "application/json",
  });
  await writeFile(
    `artifacts/pronunciation/browser-export/verified-browser-controls${base === "/" ? "" : "-subpath"}.json`,
    JSON.stringify(reports, null, 2) + "\n",
  );
});
test("required automatic download, actual app grading, saved scores, cancellation and offline fresh-document scoring", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  const modelRequests: string[] = [];
  context.on("request", (r) => {
    if (r.url().includes("/models/")) modelRequests.push(r.url());
  });
  await seed(page);
  expect(modelRequests.some((u) => u.includes("encoder-00.bin"))).toBeTruthy();
  const score = page.getByRole("button", {
    name: "Score speech with v3 model",
  });
  await score.click();
  const badge = page.getByLabel(/^Reference similarity \d+ out of 100$/);
  await expect(badge).toBeVisible({ timeout: 60000 });
  await expect(page.getByLabel("Local syllable scores")).toContainText(
    "syllables scored",
  );
  const saved = await page.evaluate(
    async () =>
      await new Promise<any>((resolve, reject) => {
        const r = indexedDB.open("pte-studio", 2);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("attempts"),
            q = tx.objectStore("attempts").get("comparison-fixture");
          q.onsuccess = () =>
            resolve(
              q.result.result.answers["repeat-sentence-01"].pronunciation,
            );
          tx.oncomplete = () => db.close();
        };
        r.onerror = () => reject(r.error);
      }),
  );
  expect(saved.modelSha256).toBe(COMPARISON_MODEL_SHA);
  expect(saved.syllables.some((s: any) => s.similarity !== null)).toBeTruthy();
  expect(
    await page.evaluate(() => localStorage.getItem("pte-studio-history-v1")),
  ).not.toContain("pronunciation");
  if (base === "/") {
    await page.screenshot({ path: "docs/evidence/speech-v3-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(async () => {
        const pager = await page
            .getByRole("navigation", { name: "syllable score pages" })
            .boundingBox(),
          footer = await page
            .getByRole("navigation", { name: "Mobile navigation" })
            .boundingBox();
        return !!pager && !!footer && pager.y + pager.height <= footer.y + 1;
      })
      .toBeTruthy();
    await page.screenshot({ path: "docs/evidence/speech-v3-mobile.png" });
    const action = await page
        .getByRole("button", { name: "Score speech with v3 model" })
        .boundingBox(),
      audio = await page
        .getByRole("group", {
          name: "Your recording for question 1",
          exact: true,
        })
        .boundingBox();
    expect(action!.y + action!.height).toBeLessThanOrEqual(audio!.y);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBeTruthy();
  }
  await context.setOffline(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Your response", exact: true })
    .click();
  await expect(badge).toBeVisible();
  await expect(score).toBeEnabled({ timeout: 30000 });
  await score.click();
  await expect(
    page.getByRole("button", { name: "Cancel speech scoring" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancel speech scoring" }).click();
  await expect(score).toBeEnabled({ timeout: 30000 });
  await score.click();
  await expect(score).toBeEnabled({ timeout: 60000 });
  await expect(badge).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "On-device speech feedback" })
      .getByRole("alert"),
  ).toHaveCount(0);
  await context.addInitScript(() =>
    Object.defineProperty(window, "Worker", { value: undefined }),
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Your response", exact: true })
    .click();
  await expect(score).toBeEnabled({ timeout: 30000 });
  await score.click();
  await expect(
    page
      .getByRole("region", { name: "On-device speech feedback" })
      .getByRole("alert"),
  ).toContainText("unavailable");
  await expect(
    page.getByRole("group", {
      name: "Your recording for question 1",
      exact: true,
    }),
  ).toBeVisible();
});
test("failed required download blocks model grading and retries without a word-match fallback", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/models/blended-english-v3/encoder-00.bin", async (r) => {
    await held;
    await r.abort();
  });
  await page.goto(base + "types");
  const notifications = page.getByRole("button", {
    name: "Notifications",
    exact: true,
  });
  await notifications.click();
  await expect(page.getByLabel("Speech model download")).toBeVisible();
  await page.keyboard.press("Escape");
  const next = page.getByRole("button", { name: "Next question type pages" });
  await next.click();
  await notifications.click();
  if (base === "/")
    await page.screenshot({
      path: "artifacts/pronunciation/browser-export/model-loading-mobile.png",
    });
  release();
  await expect(
    page.getByRole("button", { name: "Retry model download" }),
  ).toBeVisible({ timeout: 60000 });
  await page.keyboard.press("Escape");
  await next.click();
  await notifications.click();
  if (base === "/")
    await page.screenshot({
      path: "artifacts/pronunciation/browser-export/model-error-mobile.png",
    });
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "History" })
    .click();
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  // A controlling service worker can bypass page routes on a fresh document.
  // Real offline transport keeps the missing part unavailable across reloads.
  await context.setOffline(true);
  await seed(page, false);
  await expect(
    page.getByRole("button", { name: "Score speech with v3 model" }),
  ).toBeDisabled();
  await page
    .getByRole("group", { name: "Your recording for question 1", exact: true })
    .getByRole("button", { name: /Play/ })
    .click();
  await notifications.click();
  await expect(
    page.getByRole("button", { name: "Retry model download" }),
  ).toBeVisible();
  await context.setOffline(false);
  await page.unroute("**/models/blended-english-v3/encoder-00.bin");
  await page.getByRole("button", { name: "Retry model download" }).click();
  await expect(notifications).toHaveAccessibleDescription("No notifications.", {
    timeout: 90000,
  });
  await expect(
    page.getByText("No notifications", { exact: true }),
  ).toBeVisible();
});

test("post-ready missing and corrupt cached assets expose retry and recover without reload", async ({
  page,
}) => {
  test.setTimeout(180000);
  await seed(page);
  const score = page.getByRole("button", {
    name: "Score speech with v3 model",
  });
  for (const corrupt of [false, true]) {
    await page.evaluate(async (corrupt) => {
      const name = (await caches.keys()).find((n) =>
        n.startsWith("pte-comparison:"),
      )!;
      const cache = await caches.open(name);
      const url = (await cache.keys()).find((r) =>
        r.url.endsWith("/comparison.json"),
      )!;
      if (corrupt) await cache.put(url, new Response("corrupt"));
      else await cache.delete(url);
    }, corrupt);
    await score.click();
    await page
      .getByRole("button", { name: "Notifications", exact: true })
      .click();
    const retry = page.getByRole("button", { name: "Retry model download" });
    await expect(retry).toBeVisible({ timeout: 30000 });
    await expect(score).toBeDisabled();
    await retry.click();
    await expect(score).toBeEnabled({ timeout: 60000 });
    await page.keyboard.press("Escape");
    await score.click();
    // The previous grade remains visible during rescoring. Observe this job's
    // lifecycle before checking its result, using the suite's inference budget.
    const running = page.getByRole("button", { name: "Cancel speech scoring" });
    await expect(running).toBeVisible();
    await expect(score).toBeDisabled();
    await expect(running).toHaveCount(0, { timeout: 60000 });
    await expect(score).toBeEnabled();
    await expect(
      page.getByLabel(/^Reference similarity \d+ out of 100$/),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "On-device speech feedback" })
        .getByRole("alert"),
    ).toHaveCount(0);
  }
});

test("direct practice entry starts the required model preparation before the workspace is shown", async ({
  page,
}) => {
  const download = page.waitForRequest((request) =>
    request.url().includes("/models/blended-english-v3/encoder-00.bin"),
  );
  await page.goto(base + "practice/type/reading-single");
  const request = await download;
  expect(request.method()).toBe("GET");
  expect(request.postData()).toBeNull();
  await expect(
    page.getByRole("button", { name: "Begin practice", exact: true }),
  ).toBeVisible();
});
