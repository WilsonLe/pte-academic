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
  const speech = page.getByRole("button", { name: "Speech", exact: true });
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
  expect(external).toEqual([]);
});
