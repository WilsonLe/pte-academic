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
  if (waitForModel)
    await expect(page.getByLabel(/^Reference similarity/)).toBeVisible({
      timeout: 90000,
    });
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
test("automatic initial feedback persists; isolated syllable retry grades locally, rewards once, and survives offline reload", async ({
  page,
  context,
}, info) => {
  test.setTimeout(180000);
  const requests: string[] = [];
  context.on("request", (r) => {
    if (
      r.postData() ||
      !["GET"].includes(r.method()) ||
      r.url().startsWith("https://")
    )
      requests.push(r.url());
  });
  await seed(page);
  const badge = page.getByLabel(/^Reference similarity/);
  await expect(badge).toBeVisible();
  await expect(page.getByRole("button", { name: /Compare/ })).toHaveCount(0);
  // Feed a real reference syllable through the recorder adapter, then run the actual pinned worker.
  await page.evaluate(async () => {
    const context = new AudioContext({ sampleRate: 16000 });
    const raw = await (
      await fetch(
        document.querySelector<HTMLAudioElement>(
          ".review-audio-pair .audio-player:last-child audio",
        )!.src,
      )
    ).arrayBuffer();
    const decoded = await context.decodeAudioData(raw);
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("pte-studio", 2);
      r.onsuccess = () => resolve(r.result);
    });
    const result = await new Promise<any>((resolve) => {
      const tx = db.transaction("attempts");
      const r = tx.objectStore("attempts").get("comparison-fixture");
      r.onsuccess = () => resolve(r.result);
    });
    db.close();
    const syllable = result.result.answers[
      "repeat-sentence-01"
    ].pronunciation.syllables.find(
      (s: any) => s.wordIndex === 0 && s.syllableIndex === 0,
    );
    const samples = decoded
      .getChannelData(0)
      .slice(
        Math.max(0, Math.floor(syllable.start * 16000)),
        Math.ceil(syllable.end * 16000),
      );
    const buffer = new ArrayBuffer(44 + samples.length * 2),
      view = new DataView(buffer);
    const str = (at: number, s: string) =>
      [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
    str(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    str(8, "WAVE");
    str(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 16000, true);
    view.setUint32(28, 32000, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    str(36, "data");
    view.setUint32(40, samples.length * 2, true);
    samples.forEach((s, i) =>
      view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 32767, true),
    );
    const blob = new Blob([buffer], { type: "audio/wav" });
    await context.close();
    (window as any).__tracks = [];
    const getUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await getUserMedia(constraints);
      (window as any).__tracks.push(...stream.getTracks());
      return stream;
    };
    (window as any).MediaRecorder = class {
      state = "inactive";
      mimeType = "audio/wav";
      ondataavailable: any;
      onstop: any;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: blob });
        this.onstop?.();
      }
    };
  });
  await page.getByRole("button", { name: /^Practise word 1:/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Record syllable", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Stop and grade" }).click();
  await expect(dialog.locator(".retry-result")).toHaveText(
    /(?:\d+\/100 reference similarity|Uncertain · no reliable score for this syllable\.)/,
    { timeout: 60000 },
  );
  await expect(page.getByText("+5 XP for syllable practice")).toBeVisible();
  expect(
    await page.evaluate(() =>
      (window as any).__tracks.every(
        (t: MediaStreamTrack) => t.readyState === "ended",
      ),
    ),
  ).toBe(true);
  await expect(page.locator(".xp-chip")).toHaveAttribute(
    "aria-label",
    "5 XP, level 1. View progress",
  );
  await page.screenshot({ path: info.outputPath("actual-syllable-retry.png") });
  await dialog
    .getByRole("button", { name: "Record syllable", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Stop and grade" }).click();
  await expect(dialog.locator(".retry-result")).toContainText(
    "Already practised for XP today",
    { timeout: 60000 },
  );
  await dialog
    .getByRole("button", { name: "Record syllable", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Stop and grade" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Play Reference word", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__tracks.every(
          (t: MediaStreamTrack) => t.readyState === "ended",
        ),
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Microphone permission denied", "NotAllowedError");
    };
  });
  await page.getByRole("button", { name: /^Practise word 1:/ }).click();
  await dialog
    .getByRole("button", { name: "Record syllable", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Microphone permission denied",
  );
  await expect(
    dialog.getByRole("button", { name: "Record syllable", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await context.setOffline(true);
  await page.reload();
  await expect(badge).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^5 XP, level/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Practise word 1:/ }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("group", { name: "Reference syllable", exact: true }),
  ).toBeVisible();
  expect(requests).toEqual([]);
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
    page.getByRole("button", { name: /^Practise word 1:/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Compare/ })).toHaveCount(0);
  await page
    .getByRole("group", { name: "Your recording", exact: true })
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

test("automatic feedback cancels, retains playback, and reports worker failure without repeat-comparison controls", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await seed(page);
  // Remove only the saved initial result, simulating a retained ungraded recording.
  const ungrade = async () =>
    page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const r = indexedDB.open("pte-studio", 2);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("attempts", "readwrite"),
            store = tx.objectStore("attempts"),
            get = store.get("comparison-fixture");
          get.onsuccess = () => {
            const saved = get.result;
            delete saved.result.answers["repeat-sentence-01"].pronunciation;
            store.put(saved, "comparison-fixture");
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      });
    });
  await ungrade();
  await page.reload();
  await page.getByRole("button", { name: "Cancel speech scoring" }).click();
  await expect(page.getByRole("alert")).toContainText("cancelled");
  await expect(
    page.getByRole("button", { name: "Retry feedback" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Retry feedback" }).click();
  await expect(page.getByLabel(/^Reference similarity/)).toBeVisible({
    timeout: 60000,
  });
  await ungrade();
  await context.addInitScript(() =>
    Object.defineProperty(window, "Worker", { value: undefined }),
  );
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("unavailable");
  await expect(
    page.getByRole("group", { name: "Your recording", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Compare/ })).toHaveCount(0);
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

test("an open word refreshes its learner clips when delayed initial grading completes", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await context.addInitScript(() => {
    const Original = window.Worker;
    (window as any).Worker = class extends Original {
      set onmessage(handler: any) {
        super.onmessage = (event) => {
          if (event.data?.type === "complete")
            (window as any).__releaseInitialGrade = () =>
              handler?.call(this, event);
          else handler?.call(this, event);
        };
      }
    };
  });
  await seed(page, false);
  await page.getByRole("button", { name: /^Practise word 1:/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("group", { name: "Your word", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(
      () =>
        page.evaluate(
          () => typeof (window as any).__releaseInitialGrade === "function",
        ),
      { timeout: 90000 },
    )
    .toBe(true);
  await page.evaluate(() => (window as any).__releaseInitialGrade());
  await expect(
    dialog.getByRole("group", { name: "Your word", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("group", { name: "Your syllable", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Record syllable", exact: true }),
  ).toBeEnabled();
});

test("post-ready missing and corrupt model metadata recover through notifications and initial-feedback retry", async ({
  page,
}) => {
  test.setTimeout(180000);
  await seed(page);
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
      await new Promise<void>((resolve) => {
        const r = indexedDB.open("pte-studio", 2);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("attempts", "readwrite"),
            store = tx.objectStore("attempts"),
            get = store.get("comparison-fixture");
          get.onsuccess = () => {
            const saved = get.result;
            delete saved.result.answers["repeat-sentence-01"].pronunciation;
            store.put(saved, "comparison-fixture");
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      });
    }, corrupt);
    await page
      .getByRole("button", { name: "My practice", exact: true })
      .click();
    await page.locator(".history-row").first().click();
    await page
      .getByRole("button", { name: "Notifications", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Retry model download" })
      .click({ timeout: 30000 });
    await page.keyboard.press("Escape");
    const retry = page.getByRole("button", {
      name: "Retry feedback",
      exact: true,
    });
    await expect(retry).toBeEnabled({ timeout: 60000 });
    await retry.click();
    await expect(page.getByLabel(/^Reference similarity/)).toBeVisible({
      timeout: 60000,
    });
    await expect(
      page.getByRole("button", { name: "Cancel speech scoring" }),
    ).toHaveCount(0);
  }
});
