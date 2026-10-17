import { test, expect, type Page } from "@playwright/test";
import { readFile, readdir, writeFile } from "node:fs/promises";
import {
  COMPARISON_MODEL_SHA,
  pronunciationSchema,
} from "../src/speech/comparison-schema";
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
async function runWorker(
  page: Page,
  pcm: Buffer,
  text: string,
  recognize = false,
) {
  return await page.evaluate(
    async ({ data, text, workerPath, base, recognize }) => {
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
          { audio, text, recognize, base: new URL(base, location.origin).href },
          [audio.buffer],
        );
      });
    },
    {
      data: pcm.toString("base64"),
      text,
      workerPath: await workerPath(),
      base,
      recognize,
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

test("audio-only word recognition is prompt-independent across four accents and open speaking review", async ({
  page,
  context,
}, info) => {
  test.setTimeout(240000);
  const external: string[] = [];
  context.on("request", (r) => {
    if (r.url().startsWith("https:") || r.method() !== "GET")
      external.push(r.url());
  });
  await seed(page);
  const cases = JSON.parse(
    await readFile("artifacts/word-recognition-export/cases.json", "utf8"),
  );
  let first: any;
  for (const control of cases) {
    const pcm = await readFile(control.pcm);
    const result = await runWorker(
      page,
      pcm,
      "unrelated prompt words must never supply recognition targets",
      true,
    );
    expect(result.recognition.words.map((w: any) => w.word).join(" ")).toBe(
      control.expected,
    );
    expect(result.syllables.length).toBeGreaterThan(0);
    expect(
      result.syllables.every(
        (s: any) => result.recognition.words[s.wordIndex].word === s.word,
      ),
    ).toBe(true);
    expect(
      result.recognition.words.every(
        (w: any, i: number, all: any[]) =>
          w.end > w.start && (!i || w.start >= all[i - 1].end),
      ),
    ).toBe(true);
    if (!first) first = result;
  }
  const noPrompt = await runWorker(
    page,
    await readFile(cases[0].pcm),
    "",
    true,
  );
  expect(noPrompt).toEqual(first);
  // Read Buffer bytes with its actual offset; build a 125-second open response
  // with separated speech, exercising nonadjacent windows and global positions.
  const sourceBytes = await readFile(cases[0].pcm);
  const source = new Float32Array(
    sourceBytes.buffer,
    sourceBytes.byteOffset,
    sourceBytes.byteLength / 4,
  );
  const long = new Float32Array(125 * 16000);
  for (const at of [1, 61, 111]) long.set(source, at * 16000);
  const longResult = await runWorker(page, Buffer.from(long.buffer), "", true);
  expect(longResult.recognition.words.map((w: any) => w.word).join(" ")).toBe(
    Array(3).fill(cases[0].expected).join(" "),
  );
  expect(longResult.recognition.words.at(-1).start).toBeGreaterThan(111);
  expect(pronunciationSchema.safeParse(longResult).success).toBe(true);
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("pte-studio", 2);
      r.onsuccess = () => resolve(r.result);
    });
    const old = await new Promise<any>((resolve) => {
      const r = db
        .transaction("attempts")
        .objectStore("attempts")
        .get("comparison-fixture");
      r.onsuccess = () => resolve(r.result);
    });
    const result = {
      id: "independent-open",
      label: "Describe Image",
      date: new Date().toISOString(),
      questionIds: ["describe-image-01"],
      answers: { "describe-image-01": {} },
      finished: true,
    };
    await new Promise<void>((resolve) => {
      const tx = db.transaction("attempts", "readwrite");
      tx.objectStore("attempts").put(
        {
          result,
          recordings: {
            "describe-image-01": old.recordings["repeat-sentence-01"],
          },
        },
        result.id,
      );
      tx.oncomplete = () => resolve();
    });
    db.close();
    localStorage.setItem("pte-studio-history-v1", JSON.stringify([result]));
  });
  await page.goto(base + "history/independent-open");
  await expect(
    page.getByRole("button", { name: /^Practise word 1:/ }),
  ).toBeVisible({ timeout: 90000 });
  await expect(page.getByLabel(/^Reference similarity/)).toBeVisible();
  const sourceButton = page.getByRole("button", {
    name: "Source",
    exact: true,
  });
  await sourceButton.click();
  await expect(page.getByRole("dialog").getByRole("figure")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(sourceButton).toBeFocused();
  await expect(
    page.getByText("Syllable feedback saved on this device", { exact: true }),
  ).toBeHidden({ timeout: 10000 });
  await page.getByRole("button", { name: /^Practise word 1:/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("group", { name: "Your word", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("group", { name: "Reference pronunciation", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await dialog
    .getByRole("button", { name: "Play Your word", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Play Reference pronunciation", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Play Your word", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("independent-word-desktop.png"),
  });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("independent-feedback-mobile.png"),
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByText(/Words are recognised from your recording/),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Practise word 1:/ }).click();
  await expect(
    page.getByRole("group", { name: "Reference pronunciation", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  // A controlled unsupported-word result checks the finite audio-library boundary.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("pte-studio", 2);
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("attempts", "readwrite"),
        store = tx.objectStore("attempts"),
        r = store.get("independent-open");
      r.onsuccess = () => {
        const saved = r.result,
          p = saved.result.answers["describe-image-01"].speechAssessment;
        p.recognition.words = [
          {
            word: "quizzacious",
            index: 0,
            start: 0,
            end: 0.4,
            confidence: 0.8,
            status: "unsupported",
          },
        ];
        p.syllables = [];
        p.status = "unscored";
        store.put(saved, "independent-open");
      };
      tx.oncomplete = () => resolve();
    });
    db.close();
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Practise word 1: quizzacious", exact: true })
    .click();
  await expect(
    page.getByText("No reference recording is available for this word yet."),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Your word", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Reference pronunciation", exact: true }),
  ).toHaveCount(0);
  expect(external).toEqual([]);
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
    ].speechAssessment.syllables.find(
      (s: any) => s.wordIndex === 0 && s.syllableIndex === 0,
    );
    const samples = decoded
      .getChannelData(0)
      .slice(
        Math.max(0, Math.floor(syllable.start * 16000)),
        Math.ceil(syllable.end * 16000),
      );
    await context.close();
    (window as any).__tracks = [];
    (window as any).__quietRetry = true;
    const starts = new Map<string, () => void>();
    navigator.mediaDevices.getUserMedia = async () => {
      const ac = new AudioContext({ sampleRate: 48000 });
      await ac.resume();
      const destination = ac.createMediaStreamDestination(),
        source = ac.createBufferSource();
      const captureSamples = (window as any).__quietRetry
        ? Float32Array.from(
            { length: 16000 },
            (_, i) => 0.002 * Math.sin((2 * Math.PI * 440 * i) / 16000),
          )
        : samples;
      source.buffer = ac.createBuffer(1, captureSamples.length, 16000);
      source.buffer.copyToChannel(captureSamples, 0);
      source.connect(destination);
      starts.set(destination.stream.id, () =>
        source.start(ac.currentTime + 0.1),
      );
      for (const track of destination.stream.getTracks()) {
        const stop = track.stop.bind(track);
        let closed = false;
        track.stop = () => {
          stop();
          if (!closed) {
            closed = true;
            void ac.close();
          }
        };
        (window as any).__tracks.push(track);
      }
      return destination.stream;
    };
    const start = MediaRecorder.prototype.start;
    MediaRecorder.prototype.start = function (...args) {
      const result = start.apply(this, args);
      starts.get(this.stream.id)?.();
      return result;
    };
  });
  await page.getByRole("button", { name: /^Practise word 1:/ }).click();
  const dialog = page.getByRole("dialog");
  // Nonzero room-level input must not count as completed audible practice.
  await dialog
    .getByRole("button", { name: "Record syllable", exact: true })
    .click();
  await page.waitForTimeout(1200); // Capture the known quiet input through the native codec.
  await dialog.getByRole("button", { name: "Stop and grade" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "That recording was too quiet. Speak closer to the microphone and try again. No XP awarded.",
    { timeout: 60000 },
  );
  await expect(page.locator(".xp-chip")).toHaveAttribute(
    "aria-label",
    "0 XP, level 1. View progress",
  );
  await expect(
    dialog.getByRole("button", { name: "Play Your new syllable" }),
  ).toBeEnabled();
  await expect(page.getByText("+5 XP for syllable practice")).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).__quietRetry = false;
  });
  await dialog
    .getByRole("button", { name: "Record syllable", exact: true })
    .click();
  await page.waitForTimeout(1200); // Let the controlled syllable enter the native recorder.
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
  await page.waitForTimeout(1200); // Let the controlled syllable enter the native recorder.
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
    dialog.getByRole("button", {
      name: "Play Reference pronunciation",
      exact: true,
    }),
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
  await page.addInitScript(() => {
    if (sessionStorage.getItem("pte-test-download-released")) return;
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) =>
      String(input).endsWith("/models/blended-english-v3/encoder-00.bin")
        ? new Promise<Response>((resolve) => {
            (window as any).__failModelDownload = () => {
              sessionStorage.setItem("pte-test-download-released", "1");
              window.fetch = nativeFetch;
              resolve(new Response("Download unavailable", { status: 503 }));
            };
          })
        : nativeFetch(input, init);
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
  await page.evaluate(() => (window as any).__failModelDownload());
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
  ).toHaveCount(0);
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
            delete saved.result.answers["repeat-sentence-01"].speechAssessment;
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

test("word controls wait for independent recognition rather than inventing prompt-aligned speech", async ({
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
  await expect(
    page.getByRole("button", { name: /^Practise word/ }),
  ).toHaveCount(0);
  const dialog = page.getByRole("dialog");
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
  await page.getByRole("button", { name: /^Practise word 1:/ }).click();
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
  for (const [path, corrupt] of [
    ["comparison.json", false],
    ["comparison.json", true],
    ["vocab.json", false],
    ["lexicon.json", true],
  ] as const) {
    await page.evaluate(
      async ({ path, corrupt }) => {
        const name = (await caches.keys()).find((n) =>
          n.startsWith("pte-comparison:"),
        )!;
        const cache = await caches.open(name);
        const url = (await cache.keys()).find((r) =>
          r.url.endsWith("/" + path),
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
              delete saved.result.answers["repeat-sentence-01"]
                .speechAssessment;
              store.put(saved, "comparison-fixture");
            };
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
          };
        });
      },
      { path, corrupt },
    );
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

test("isolated retries accept all four reference accents after native recording and reject wrong syllables", async ({
  page,
}, info) => {
  test.setTimeout(240000);
  await seed(page);
  const workerUrl = await workerPath();
  const report = await page.evaluate(
    async ({ workerUrl, base }) => {
      const cache = await caches.open(
        (await caches.keys()).find((k) => k.startsWith("pte-comparison:"))!,
      );
      const index = await (await cache.match(
        new URL(
          base + "models/word-recognition-v1/word-references.json",
          location.origin,
        ),
      ))!.json();
      const library = index.words.library.slice(0, 4);
      const references = [] as {
        accent: string;
        label: string;
        audio: Float32Array;
      }[];
      const wrong = [] as Float32Array[];
      for (const ref of library) {
        const bytes = await (await cache.match(
          new URL(
            base + "models/word-recognition-v1/" + ref.audio,
            location.origin,
          ),
        ))!.arrayBuffer();
        const ctx = new AudioContext({ sampleRate: 48000 });
        const decoded = await ctx.decodeAudioData(bytes);
        const slice = (i: number) =>
          decoded
            .getChannelData(0)
            .slice(
              Math.floor(ref.syllables[i].start * 48000),
              Math.ceil(ref.syllables[i].end * 48000),
            );
        references.push({
          accent: ref.accent,
          label: ref.syllables[0].label,
          audio: slice(0),
        });
        if (ref.accent === "en-US") {
          wrong.push(slice(1), slice(2));
        }
        await ctx.close();
      }
      async function recorded(pcm: Float32Array) {
        const ctx = new AudioContext({ sampleRate: 48000 });
        await ctx.resume();
        const dest = ctx.createMediaStreamDestination(),
          source = ctx.createBufferSource();
        source.buffer = ctx.createBuffer(1, pcm.length, 48000);
        source.buffer.copyToChannel(pcm as Float32Array<ArrayBuffer>, 0);
        source.connect(dest);
        const recorder = new MediaRecorder(dest.stream);
        const chunks: BlobPart[] = [];
        recorder.ondataavailable = (e) => chunks.push(e.data);
        const blob = await new Promise<Blob>((resolve) => {
          recorder.onstop = () =>
            resolve(new Blob(chunks, { type: recorder.mimeType }));
          recorder.start();
          source.start(ctx.currentTime + 0.25);
          setTimeout(() => recorder.stop(), (pcm.length / 48000 + 1) * 1000);
        });
        dest.stream.getTracks().forEach((t) => t.stop());
        await ctx.close();
        const decode = new AudioContext({ sampleRate: 16000 });
        try {
          return (await decode.decodeAudioData(await blob.arrayBuffer()))
            .getChannelData(0)
            .slice();
        } finally {
          await decode.close();
        }
      }
      async function grade(audio: Float32Array, refs = references) {
        const worker = new Worker(workerUrl, { type: "module" });
        try {
          return await new Promise<any>((resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error("Retry timed out")),
              60000,
            );
            worker.onmessage = (e) => {
              if (e.data.type === "complete") {
                clearTimeout(timer);
                resolve(e.data.result);
              }
              if (e.data.type === "error") {
                clearTimeout(timer);
                reject(new Error(e.data.message));
              }
            };
            worker.onerror = (e) => {
              clearTimeout(timer);
              reject(new Error(e.message));
            };
            worker.postMessage({
              audio,
              text: "unrelated prompt",
              target: {
                word: "library",
                wordIndex: 1,
                syllableIndex: 0,
                syllableCount: 3,
              },
              references: refs,
              base: new URL(base, location.origin).href,
            });
          });
        } finally {
          worker.terminate();
        }
      }
      const raw = references.map((r) => r.audio);
      for (const ref of references) ref.audio = await recorded(ref.audio);
      const positive = [];
      for (const [i, ref] of references.entries())
        positive.push({
          accent: ref.accent,
          result: await grade(await recorded(raw[i])),
        });
      const negative = [];
      for (const audio of wrong)
        negative.push(await grade(await recorded(audio)));
      const missing = await grade(references[0].audio, []);
      const silence = await grade(new Float32Array(16000));
      return { positive, negative, missing, silence };
    },
    { workerUrl, base },
  );
  await writeFile(
    info.outputPath("native-controls.json"),
    JSON.stringify(report, null, 2),
  );
  for (const control of report.positive) {
    const syllable = control.result.syllables[0];
    if (syllable.similarity === null)
      expect(syllable.status, control.accent).toBe("uncertain");
    else expect(syllable.similarity, control.accent).toBeGreaterThanOrEqual(75);
    expect(pronunciationSchema.safeParse(control.result).success).toBe(true);
  }
  expect(
    report.positive.filter((c) => c.result.syllables[0].similarity >= 75)
      .length,
  ).toBeGreaterThanOrEqual(3);
  for (const control of report.negative)
    expect(control.syllables[0]?.similarity ?? 0).toBeLessThan(50);
  expect(
    report.missing.syllables.every((s: any) => s.similarity === null),
  ).toBe(true);
  expect(report.silence.status).toBe("no-reliable-speech");
  await info.attach("isolated-reference-controls", {
    body: JSON.stringify(report, null, 2),
    contentType: "application/json",
  });
});

test("warm preparation avoids model transfers and saved word references work while weights prepare", async ({
  page,
}, info) => {
  test.setTimeout(150000);
  await seed(page);
  const transferred: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/models/")) transferred.push(r.url());
  });
  const started = Date.now();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Notifications", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Notifications", exact: true })
    .click();
  await expect(
    page.getByText("No notifications", { exact: true }),
  ).toBeVisible();
  const warmMilliseconds = Date.now() - started;
  expect(transferred).toEqual([]);
  await page.keyboard.press("Escape");
  await page.evaluate(async (base) => {
    const key = (await caches.keys()).find((k) =>
      k.startsWith("pte-comparison:"),
    )!;
    const cache = await caches.open(key);
    await cache.delete(
      new URL(
        base + "models/blended-english-v3/encoder-00.bin",
        location.origin,
      ),
    );
  }, base);
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init) =>
      String(input).endsWith("/models/blended-english-v3/encoder-00.bin")
        ? new Promise<Response>((resolve) => {
            (window as any).__releaseWeights = () => {
              window.fetch = nativeFetch;
              resolve(nativeFetch(input, init));
            };
          })
        : nativeFetch(input, init);
  });
  const release = () =>
    page.evaluate(() => (window as any).__releaseWeights?.());
  try {
    await page.reload();
    await expect(page.getByLabel(/^Reference similarity/)).toBeVisible();
    await page
      .getByRole("button", { name: /^Practise word 2: library/ })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("button", {
        name: "Play Reference pronunciation",
        exact: true,
      }),
    ).toBeEnabled();
    await expect(
      dialog.getByRole("button", { name: "Record syllable", exact: true }),
    ).toBeDisabled();
    await dialog
      .getByRole("button", {
        name: "Play Reference pronunciation",
        exact: true,
      })
      .click();
    await expect
      .poll(() =>
        dialog
          .getByRole("group", { name: "Reference pronunciation", exact: true })
          .locator("audio")
          .evaluate((a) => (a as HTMLAudioElement).currentTime),
      )
      .toBeGreaterThan(0);
    const referenceUrl = await dialog
      .getByRole("group", { name: "Reference pronunciation", exact: true })
      .locator("audio")
      .getAttribute("src");
    await release();
    await expect(
      dialog.getByRole("button", { name: "Record syllable", exact: true }),
    ).toBeEnabled({ timeout: 30000 });
    expect(
      await dialog
        .getByRole("group", { name: "Reference pronunciation", exact: true })
        .locator("audio")
        .getAttribute("src"),
    ).toBe(referenceUrl);
  } finally {
    await release();
  }
  await info.attach("warm-preparation", {
    body: JSON.stringify({ warmMilliseconds, modelTransfersOnWarmStart: 0 }),
    contentType: "application/json",
  });
});

test("an open word dialog recovers a failed reference when header preparation finishes", async ({
  page,
}) => {
  test.setTimeout(120000);
  await seed(page);
  await page.evaluate(async (base) => {
    const key = (await caches.keys()).find((k) =>
      k.startsWith("pte-comparison:"),
    )!;
    const cache = await caches.open(key);
    for (const path of [
      "models/blended-english-v3/encoder-00.bin",
      "models/blended-english-v3/encoder-01.bin",
      "models/word-recognition-v1/word-reference-en-US.mp3",
    ])
      await cache.delete(new URL(base + path, location.origin));
  }, base);
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    let phase = "fail",
      referenceRequests = 0;
    const pending: Array<() => void> = [];
    (window as any).__referenceRecovery = {
      hold: () => {
        phase = "hold";
      },
      release: () => {
        phase = "released";
        pending.splice(0).forEach((f) => f());
      },
    };
    window.fetch = (input, init) => {
      const url = String(input);
      if (/\/encoder-0[01]\.bin$/.test(url)) {
        if (phase === "fail")
          return Promise.resolve(new Response("Unavailable", { status: 503 }));
        if (phase === "hold")
          return new Promise<Response>((resolve) =>
            pending.push(() => resolve(nativeFetch(input, init))),
          );
      }
      if (
        url.endsWith("/word-reference-en-US.mp3") &&
        referenceRequests++ === 0
      )
        return Promise.resolve(new Response("Unavailable", { status: 503 }));
      return nativeFetch(input, init);
    };
  });
  try {
    await page.reload();
    const bell = page.getByRole("button", {
      name: "Notifications",
      exact: true,
    });
    await bell.click();
    await expect(
      page.getByRole("button", { name: "Retry model download", exact: true }),
    ).toBeVisible();
    await page.evaluate(() => (window as any).__referenceRecovery.hold());
    await page
      .getByRole("button", { name: "Retry model download", exact: true })
      .click();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: /^Practise word 2: library/ })
      .click();
    const dialog = page.getByRole("dialog", { name: "library", exact: true });
    await expect(
      dialog.getByText("The word reference could not be loaded.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", {
        name: "Play Reference pronunciation",
        exact: true,
      }),
    ).toHaveCount(0);
    await page.evaluate(() => (window as any).__referenceRecovery.release());
    await expect(
      dialog.getByRole("button", {
        name: "Play Reference pronunciation",
        exact: true,
      }),
    ).toBeEnabled({ timeout: 30000 });
    await expect(
      dialog.getByRole("button", { name: "Record syllable", exact: true }),
    ).toBeEnabled();
    await expect(
      dialog.getByText("The word reference could not be loaded.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await dialog
      .getByRole("button", {
        name: "Play Reference pronunciation",
        exact: true,
      })
      .click();
    await expect
      .poll(() =>
        dialog
          .getByRole("group", { name: "Reference pronunciation", exact: true })
          .locator("audio")
          .evaluate((a) => (a as HTMLAudioElement).currentTime),
      )
      .toBeGreaterThan(0);
  } finally {
    await page.evaluate(() => (window as any).__referenceRecovery?.release());
  }
});
