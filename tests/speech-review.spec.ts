import { test, expect } from "@playwright/test";

const base = process.env.PTE_TEST_SUBPATH === "1" ? "/pte-academic/" : "/";
test("speech review keeps legacy transcripts and playback without transcription or word-match actions", async ({
  page,
  context,
}, info) => {
  const external: string[] = [];
  context.on("request", (r) => {
    if (new URL(r.url()).origin !== new URL(info.project.use.baseURL!).origin)
      external.push(r.url());
  });
  // Keep this compatibility check small; inference is covered by comparison.spec.ts.
  await context.route("**/models/**", (route) => route.abort());
  await page.goto(base);
  await page.evaluate(async () => {
    const recording = await (
      await fetch(new URL("audio/repeat-sentence-01.mp3", document.baseURI))
    ).blob();
    const result = {
      id: "legacy-speech-review",
      label: "Saved speaking practice",
      date: new Date().toISOString(),
      questionIds: ["repeat-sentence-01", "describe-image-01"],
      answers: {
        "repeat-sentence-01": {
          transcription: {
            text: "The saved transcript stays readable.",
            seconds: 3,
            engine: "transformers.js-4.3.1/whisper-q8-wasm",
            model: "onnx-community/whisper-tiny.en",
            revision: "2575352d61be1bf7225cf8f8b268a4678025fc58",
          },
        },
        "describe-image-01": {},
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
        tx.objectStore("attempts").put(
          {
            result,
            recordings: {
              "repeat-sentence-01": recording,
              "describe-image-01": recording,
            },
          },
          result.id,
        );
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
  await page.goto(base + "history/legacy-speech-review");
  const speech = page.getByRole("button", {
    name: "Feedback",
    exact: true,
  });
  await speech.click();
  const panel = page.getByRole("region", { name: "On-device speech feedback" });
  await expect(panel.getByLabel("Local transcript result")).toContainText(
    "The saved transcript stays readable.",
  );
  await expect(
    panel.getByRole("button", { name: /Transcribe|Word comparison/i }),
  ).toHaveCount(0);
  await expect(panel.getByText(/word match|words\/min|60 MB/i)).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Score speech with v3 model" }),
  ).toBeDisabled();
  await panel
    .getByRole("group", { name: "Your recording for question 1", exact: true })
    .getByRole("button", { name: /Play/ })
    .click();
  await expect(panel.getByRole("button", { name: /Pause/ })).toBeVisible();
  await page.reload();
  await speech.click();
  await expect(panel.getByLabel("Local transcript result")).toContainText(
    "The saved transcript stays readable.",
  );
  await page.screenshot({ path: info.outputPath("saved-transcript.png") });
  await page
    .getByRole("button", { name: "Next review questions", exact: true })
    .click();
  await expect(
    panel.getByRole("button", {
      name: /Transcribe|Score speech|Word comparison/i,
    }),
  ).toHaveCount(0);
  await expect(panel).toContainText(
    "Listen back and compare your response with the example for self-review.",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    panel.getByRole("group", {
      name: "Your recording for question 2",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("self-review-mobile.png") });
  await page.getByRole("button", { name: "Prompt", exact: true }).click();
  await expect(page.locator(".reading-copy")).toContainText(
    "Example response:",
  );
  expect(external).toEqual([]);
});

test("syllable rows remain readable below media controls on a short phone", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.context().route("**/models/**", (route) => route.abort());
  await page.goto(base);
  await page.evaluate(async () => {
    const recording = await (
      await fetch(new URL("audio/repeat-sentence-01.mp3", document.baseURI))
    ).blob();
    const pronunciation = {
      schemaVersion: 1,
      modelSha256:
        "2a8e9680e71c85d98f2adc8da725c56f21bd866340cf545916fdf5dff7389d1b",
      exportId: "blended-english-v3-fp16-storage-f32-v1",
      referenceAccents: ["en-US", "en-GB", "en-AU", "en-IN"],
      seconds: 3,
      status: "scored",
      syllables: Array.from({ length: 24 }, (_, i) => ({
        word: "practice",
        wordIndex: i,
        syllableIndex: 0,
        label: "practice",
        start: i / 10,
        end: i / 10 + 0.1,
        similarity: i % 3 ? 75 : null,
        confidence: i % 3 ? 0.8 : 0,
        status: i % 3 ? "scored" : "uncertain",
      })),
    };
    const result = {
      id: "syllable-layout",
      label: "Saved speaking practice",
      date: new Date().toISOString(),
      questionIds: ["repeat-sentence-01", "describe-image-01"],
      answers: { "repeat-sentence-01": { pronunciation } },
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
        const db = request.result,
          tx = db.transaction("attempts", "readwrite");
        tx.objectStore("attempts").put(
          { result, recordings: { "repeat-sentence-01": recording } },
          result.id,
        );
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
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto(base + "history/syllable-layout");
  await page.getByRole("button", { name: "Feedback", exact: true }).click();
  const table = page.getByRole("table", { name: "Syllable similarities" });
  const firstRow = table.locator("tbody tr").first();
  await firstRow.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      table.evaluate((node) => {
        const view = node
          .closest(".syllable-table-view")!
          .getBoundingClientRect();
        const header = node.querySelector("thead")!.getBoundingClientRect();
        const row = node.querySelector("tbody tr")!.getBoundingClientRect();
        return view.height >= header.height + row.height;
      }),
    )
    .toBe(true);
  await expect(firstRow).toContainText("Uncertain");
  const next = page.getByRole("button", { name: "Next syllable score pages" });
  await next.click();
  await expect(
    page.getByRole("navigation", { name: "syllable score pages" }),
  ).toContainText("2 /");
  await page.getByRole("button", { name: "How local feedback works" }).click();
  await expect(
    page.getByRole("dialog", { name: "How local feedback works" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(table).toBeVisible();
  await expect(
    page.getByRole("button", { name: "How local feedback works" }),
  ).toBeFocused();
});

test("speaking Feedback opens syllables directly and remains available without recordings", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.context().route("**/models/**", (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.evaluate(async () => {
    const recording = await (
      await fetch(new URL("audio/repeat-sentence-01.mp3", document.baseURI))
    ).blob();
    const pronunciation = {
      schemaVersion: 1,
      modelSha256:
        "2a8e9680e71c85d98f2adc8da725c56f21bd866340cf545916fdf5dff7389d1b",
      exportId: "blended-english-v3-fp16-storage-f32-v1",
      referenceAccents: ["en-US", "en-GB", "en-AU", "en-IN"],
      seconds: 3,
      status: "scored",
      syllables: [
        {
          word: "Urban",
          wordIndex: 0,
          syllableIndex: 0,
          label: "ur",
          start: 0,
          end: 0.2,
          similarity: 82,
          confidence: 0.9,
          status: "scored",
        },
      ],
    };
    const result = {
      id: "feedback-discovery",
      label: "Speaking feedback",
      date: new Date().toISOString(),
      finished: true,
      questionIds: [
        "read-aloud-01",
        "repeat-sentence-01",
        "read-aloud-02",
        "read-aloud-03",
        "describe-image-01",
        "reading-single-01",
      ],
      answers: {
        "read-aloud-01": { pronunciation },
        "repeat-sentence-01": { pronunciation },
        "read-aloud-03": { pronunciation },
      },
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
        const db = request.result,
          tx = db.transaction("attempts", "readwrite");
        tx.objectStore("attempts").put(
          {
            result,
            recordings: {
              "read-aloud-01": recording,
              "repeat-sentence-01": recording,
            },
          },
          result.id,
        );
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
  await page.goto(base + "history/feedback-discovery");
  const panels = page.getByRole("group", {
    name: "Review panels",
    exact: true,
  });
  const feedback = panels.getByRole("button", {
    name: "Feedback",
    exact: true,
  });
  await expect(feedback).toHaveAttribute("aria-pressed", "true");
  await expect(feedback.locator("span")).toBeVisible();
  await expect(
    panels.getByRole("button", { name: /Information|Speech/ }),
  ).toHaveCount(0);
  await expect(panels.locator(".lucide-info")).toHaveCount(0);
  const table = page.getByRole("table", { name: "Syllable similarities" });
  await expect(table).toContainText("82");
  await page.screenshot({
    path: info.outputPath("read-aloud-feedback-mobile.png"),
  });
  await panels
    .getByRole("button", { name: "Your response", exact: true })
    .click();
  await expect(table).toHaveCount(0);
  await expect(
    page.getByRole("group", {
      name: "Your recording for question 1",
      exact: true,
    }),
  ).toBeVisible();
  await feedback.focus();
  await page.keyboard.press("Enter");
  await expect(table).toBeVisible();
  await page.reload();
  await expect(table).toContainText("82");
  const next = page.getByRole("button", {
    name: "Next review questions",
    exact: true,
  });
  await next.click();
  await expect(table).toContainText("82");
  await next.click();
  await expect(feedback).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("region", { name: "On-device speech feedback" }),
  ).toContainText("No recording was saved");
  await expect(
    page.getByRole("button", { name: "Score speech with v3 model" }),
  ).toHaveCount(0);
  await expect(page.locator(".local-speech-screen audio")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("missing-recording-mobile.png"),
  });
  await next.click();
  await expect(table).toContainText("82");
  await expect(page.locator(".local-speech-screen audio")).toHaveCount(0);
  await next.click();
  await expect(
    page.getByRole("region", { name: "On-device speech feedback" }),
  ).toContainText("No recording was saved");
  await next.click();
  await expect(
    page.getByRole("region", { name: "On-device speech feedback" }),
  ).toHaveCount(0);
  await expect(page.locator(".review-screen .reading-copy")).toContainText(
    "The final clause states that arranging early meetings became harder.",
  );
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(base + "history/feedback-discovery");
  await expect(feedback.locator("span")).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: "Score speech with v3 model" })
      .locator("span"),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("read-aloud-feedback-short-phone.png"),
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base + "history/feedback-discovery");
  await expect(table).toBeVisible();
  await page.screenshot({
    path: info.outputPath("read-aloud-feedback-desktop.png"),
  });
});
