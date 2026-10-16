import { test, expect, type Page } from "@playwright/test";
const indexKey = "pte-studio-history-v1";
const appBase = process.env.PTE_TEST_SUBPATH === "1" ? "/pte-academic/" : "/";
async function seed(page: Page, { silence = false, recorded = false } = {}) {
  await page.goto(appBase);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.evaluate(
    async ({ indexKey, silence, recorded }) => {
      let recording: Blob;
      if (silence) {
        const bytes = new ArrayBuffer(44 + 32000);
        const view = new DataView(bytes);
        const text = (i: number, s: string) => {
          for (let n = 0; n < s.length; n++)
            view.setUint8(i + n, s.charCodeAt(n));
        };
        text(0, "RIFF");
        view.setUint32(4, bytes.byteLength - 8, true);
        text(8, "WAVEfmt ");
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 16000, true);
        view.setUint32(28, 32000, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        text(36, "data");
        view.setUint32(40, 32000, true);
        recording = new Blob([bytes], { type: "audio/wav" });
      } else
        recording = await (
          await fetch("./audio/repeat-sentence-01.mp3")
        ).blob();
      if (recorded) {
        const context = new AudioContext();
        const decoded = await context.decodeAudioData(
          await recording.arrayBuffer(),
        );
        const source = context.createBufferSource();
        source.buffer = decoded;
        const destination = context.createMediaStreamDestination();
        source.connect(destination);
        recording = await new Promise<Blob>((resolve) => {
          const recorder = new MediaRecorder(destination.stream),
            chunks: Blob[] = [];
          recorder.ondataavailable = (event) => {
            if (event.data.size) chunks.push(event.data);
          };
          recorder.onstop = () =>
            resolve(new Blob(chunks, { type: recorder.mimeType }));
          source.onended = () => recorder.stop();
          recorder.start();
          source.start();
        });
        destination.stream.getTracks().forEach((track) => track.stop());
        await context.close();
      }
      const result = {
        id: "local-speech-fixture",
        label: "Repeat Sentence",
        date: new Date().toISOString(),
        questionIds: ["repeat-sentence-01"],
        answers: { "repeat-sentence-01": {} },
        finished: true,
      };
      await new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("pte-studio");
        r.onupgradeneeded = () => r.result.createObjectStore("attempts");
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
        indexKey,
        JSON.stringify([{ ...result, answers: {} }]),
      );
    },
    { indexKey, silence, recorded },
  );
  await openReview(page);
}
async function openReview(page: Page) {
  await page.goto(appBase + "#history");
  await page.reload();
  await page.locator(".history-row").first().click();
  await page.getByRole("button", { name: "Speech", exact: true }).click();
}
test("real on-device recognition, private transport, saved feedback and offline fresh-document reuse", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  const requests: Array<{ url: string; method: string; hasBody: boolean }> = [];
  context.on("request", (r) =>
    requests.push({
      url: r.url(),
      method: r.method(),
      hasBody: !!r.postDataBuffer(),
    }),
  );
  await seed(page);
  expect(
    requests.filter(
      (r) =>
        r.url.includes("huggingface.co") ||
        /speech\.worker-|\.wasm/.test(r.url),
    ),
  ).toHaveLength(0);
  await page
    .getByRole("button", { name: "Transcribe on this device", exact: true })
    .click();
  const result = page.getByRole("region", {
    name: "On-device speech feedback",
  });
  await expect
    .poll(
      async () =>
        (await result.getByRole("alert").count())
          ? "error"
          : (await result
                .getByRole("button", {
                  name: "Transcribe again on this device",
                })
                .count())
            ? "complete"
            : "pending",
      { timeout: 150000 },
    )
    .not.toBe("pending");
  if (await result.getByRole("alert").count())
    throw new Error((await result.getByRole("alert").textContent())!);
  await expect(
    result.getByRole("button", { name: "Transcribe again on this device" }),
  ).toBeEnabled();
  await expect(result.getByLabel("Local transcript result")).toContainText(
    /library.*midnight/i,
  );
  const badge = result.getByLabel(/Word match \d+ percent/);
  await expect(badge).toBeVisible();
  const percent = Number((await badge.textContent())!.match(/\d+/)![0]);
  expect(percent).toBeGreaterThanOrEqual(70);
  expect(
    requests.every((r) => ["GET", "HEAD"].includes(r.method) && !r.hasBody),
  ).toBe(true);
  const external = requests.filter(
    (r) => r.url.startsWith("http") && new URL(r.url).hostname !== "127.0.0.1",
  );
  expect(external.length).toBeGreaterThan(0);
  expect(
    external
      .filter((r) => new URL(r.url).hostname === "huggingface.co")
      .every((r) =>
        new URL(r.url).pathname.includes(
          "/2575352d61be1bf7225cf8f8b268a4678025fc58/",
        ),
      ),
  ).toBe(true);

  expect(
    external.every((r) =>
      ["huggingface.co", "hf.co", "xethub.hf.co"].some(
        (host) =>
          new URL(r.url).hostname === host ||
          new URL(r.url).hostname.endsWith("." + host),
      ),
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/evidence/local-speech-review.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(() => localStorage.getItem("pte-studio-history-v1")),
  ).not.toContain('"transcription"');
  await context.setOffline(true);
  await openReview(page);
  await expect(page.getByLabel("Local transcript result")).toContainText(
    /library.*midnight/i,
  );
  await page
    .getByRole("button", { name: "Transcribe again on this device" })
    .click();
  await expect(
    page.getByRole("button", { name: "Transcribe again on this device" }),
  ).toBeEnabled({ timeout: 60000 });
  await expect(page.getByLabel("Local transcript result")).toContainText(
    /library.*midnight/i,
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "My practice", exact: true }).click();
  await page.getByRole("button", { name: "Clear practice history" }).click();
  await page
    .getByRole("button", { name: "Clear history", exact: true })
    .click();
  expect(
    await page.evaluate(async () => {
      return await new Promise<number>((resolve) => {
        const r = indexedDB.open("pte-studio");
        r.onsuccess = () => {
          const db = r.result,
            q = db.transaction("attempts").objectStore("attempts").count();
          q.onsuccess = () => {
            db.close();
            resolve(q.result);
          };
        };
      });
    }),
  ).toBe(0);
});
test("silence receives no score and never downloads the speech model", async ({
  page,
  context,
}) => {
  const external: string[] = [];
  context.on("request", (r) => {
    if (r.url().startsWith("https:")) external.push(r.url());
  });
  await seed(page, { silence: true });
  await page
    .getByRole("button", { name: "Transcribe on this device", exact: true })
    .click();
  await expect(
    page.getByText(
      "No speech recognized. Replay your recording and try again.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel(/Word match/)).toHaveCount(0);
  expect(external).toHaveLength(0);
});
test("download failure and cancellation preserve replay and allow retry", async ({
  page,
  context,
}) => {
  await seed(page);
  await context.route("https://huggingface.co/**", (route) => route.abort());
  await page
    .getByRole("button", { name: "Transcribe on this device", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Transcription could not finish",
    { timeout: 20000 },
  );
  await expect(
    page.getByLabel("Your recording for question 1", { exact: true }),
  ).toBeVisible();
  await context.unroute("https://huggingface.co/**");
  await context.route("https://huggingface.co/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.abort();
  });
  await page
    .getByRole("button", { name: "Transcribe on this device", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel transcription" }).click();
  await expect(
    page.getByRole("button", {
      name: "Transcribe on this device",
      exact: true,
    }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Cancel transcription" }),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Transcribe on this device", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Transcription could not finish",
    { timeout: 20000 },
  );
});

test("unsupported workers keep self-review available", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "Worker", { value: undefined });
  });
  await seed(page);
  await page
    .getByRole("button", { name: "Transcribe on this device", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "unavailable in this browser",
  );
  await expect(
    page.getByLabel("Your recording for question 1", { exact: true }),
  ).toBeVisible();
});

test("undecodable recording reports an error without downloading models", async ({
  page,
  context,
}) => {
  const external: string[] = [];
  context.on("request", (r) => {
    if (r.url().startsWith("https:")) external.push(r.url());
  });
  await seed(page);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const r = indexedDB.open("pte-studio");
      r.onsuccess = () => {
        const db = r.result,
          tx = db.transaction("attempts", "readwrite"),
          store = tx.objectStore("attempts"),
          q = store.get("local-speech-fixture");
        q.onsuccess = () => {
          const row = q.result;
          row.recordings["repeat-sentence-01"] = new Blob(["not audio"], {
            type: "audio/webm",
          });
          store.put(row, "local-speech-fixture");
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await openReview(page);
  await page
    .getByRole("button", { name: "Transcribe on this device", exact: true })
    .click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Transcribe on this device",
      exact: true,
    }),
  ).toBeEnabled();
  expect(external).toHaveLength(0);
});

test("small phone speech review pages stay readable without scrolling", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page);
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("pte-studio");
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("attempts", "readwrite"),
          store = tx.objectStore("attempts"),
          get = store.get("local-speech-fixture");
        get.onsuccess = () => {
          const stored = get.result;
          stored.result.answers["repeat-sentence-01"] = {
            transcription: {
              text: Array.from(
                { length: 35 },
                (_, i) =>
                  "Practice sentence " + i + " has several recognized words.",
              ).join(" "),
              seconds: 100,
              engine: "layout fixture",
              model: "fixture",
              revision: "fixture",
            },
          };
          store.put(stored, "local-speech-fixture");
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await openReview(page);
  await page.setViewportSize({ width: 360, height: 640 });
  for (const panel of [
    "Your response",
    "Answer key",
    "Feedback",
    "Prompt",
    "Speech",
  ]) {
    await page.getByRole("button", { name: panel, exact: true }).click();
    if (panel === "Your response") {
      await expect(
        page.getByRole("group", {
          name: "Your recording for question 1",
          exact: true,
        }),
      ).toBeVisible();
      await expect(page.locator(".reading-copy")).toHaveCount(0);
    } else {
      await expect
        .poll(() =>
          page
            .locator(".reading-copy")
            .evaluate((e) => e.scrollHeight <= e.clientHeight),
        )
        .toBe(true);
    }
    const overflow = await page
      .locator("main button, main audio, main input")
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => {
            const r = node.getBoundingClientRect(),
              m = document.querySelector("main")!.getBoundingClientRect();
            return (
              r.height > 0 &&
              (r.bottom > m.bottom + 1 ||
                r.right > m.right + 1 ||
                r.top < m.top - 1)
            );
          })
          .map((n) => n.getAttribute("aria-label") || n.textContent),
      );
    expect(overflow).toEqual([]);
  }
  let count = 0;
  const words: string[] = [];
  do {
    words.push((await page.locator(".reading-copy").textContent())!);
    const next = page.getByRole("button", { name: "Next transcript pages" });
    if (await next.isDisabled()) break;
    await next.click();
    count++;
  } while (count < 100);
  expect(count).toBeGreaterThan(1);
  expect(words.join(" ")).toContain(
    "Practice sentence 34 has several recognized words.",
  );
  await page.getByRole("button", { name: "How local feedback works" }).click();
  await expect
    .poll(() =>
      page
        .locator(".reading-copy")
        .evaluate((e) => e.scrollHeight <= e.clientHeight),
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Next speech help pages" }),
  ).toBeEnabled();
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const request = indexedDB.open("pte-studio");
      request.onsuccess = () => {
        const db = request.result,
          tx = db.transaction("attempts", "readwrite"),
          store = tx.objectStore("attempts"),
          get = store.get("local-speech-fixture");
        get.onsuccess = () => {
          const stored = get.result;
          stored.result.questionIds.push("describe-image-01");
          store.put(stored, "local-speech-fixture");
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await openReview(page);
  await page.getByRole("button", { name: "Next review questions" }).click();
  await page.getByRole("button", { name: "Image", exact: true }).click();
  await expect(page.getByRole("figure")).toBeVisible();
  expect(
    await page
      .locator(".review-chart .chart, .review-chart .chart *")
      .evaluateAll((nodes) =>
        nodes.every((node) => {
          const r = node.getBoundingClientRect(),
            main = document.querySelector("main")!.getBoundingClientRect();
          return r.bottom <= main.bottom + 1 && r.right <= main.right + 1;
        }),
      ),
  ).toBe(true);
});
