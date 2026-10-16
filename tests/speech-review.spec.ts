import { test, expect, type Page } from "@playwright/test";
import references from "../src/speech/reference-clips.json" with { type: "json" };
import {
  COMPARISON_MODEL_SHA,
  COMPARISON_EXPORT,
} from "../src/speech/comparison-schema";
const base = process.env.PTE_TEST_SUBPATH === "1" ? "/pte-academic/" : "/";
async function seed(
  page: Page,
  state: "scored" | "no-reliable-speech" = "scored",
  variant: "en-us" | "en-gb" = "en-us",
) {
  await page.goto(base);
  const syllables = references["read-aloud-01"].variants
    .find((v) => v.language === variant)!
    .syllables.map((s, i) => ({
      ...s,
      similarity: [null, 88, 60, 25][i % 4],
      confidence: i % 4 ? 0.8 : 0,
      status: i % 4 ? "scored" : "uncertain",
    }));
  await page.evaluate(
    async ({ syllables, state, sha, exportId }) => {
      const blob = await (
        await fetch(
          new URL("audio/read-aloud-01-reference.mp3", document.baseURI),
        )
      ).blob();
      const result = {
        id: "feedback",
        label: "Saved speaking practice",
        date: new Date().toISOString(),
        finished: true,
        questionIds: [
          "read-aloud-01",
          "read-aloud-02",
          "describe-image-01",
          "repeat-sentence-01",
        ],
        answers: {
          "read-aloud-01": {
            pronunciation: {
              schemaVersion: 1,
              modelSha256: sha,
              exportId,
              referenceAccents: ["en-US", "en-GB", "en-AU", "en-IN"],
              seconds: 20,
              status: state,
              syllables: state === "scored" ? syllables : [],
            },
          },
          "repeat-sentence-01": {
            transcription: {
              text: "The saved transcript stays readable.",
              seconds: 3,
              engine: "legacy-local",
              model: "whisper",
              revision: "old",
            },
          },
        },
      };
      await new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("pte-studio", 2);
        r.onupgradeneeded = () => {
          for (const name of ["attempts", "progress"])
            if (!r.result.objectStoreNames.contains(name))
              r.result.createObjectStore(name);
        };
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("attempts", "readwrite");
          tx.objectStore("attempts").put(
            {
              result,
              recordings: { "read-aloud-01": blob, "describe-image-01": blob },
            },
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
    },
    {
      syllables,
      state,
      sha: COMPARISON_MODEL_SHA,
      exportId: COMPARISON_EXPORT,
    },
  );
  await page.goto(base + "history/feedback");
}
test("feedback is a paged prompt diff, word and syllable playback stop at their bounds, and skipped questions are absent", async ({
  page,
  context,
}, info) => {
  await context.route("**/models/**", (r) => r.abort());
  await seed(page);
  await expect(
    page.getByRole("heading", { name: "Feedback", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "Review panels" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", {
      name: /Compare|Self-review|How local feedback|Your response|^Prompt$/,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "review questions" }),
  ).toContainText("1 / 3");
  await page.getByRole("button", { name: "Practise word 1: Urban" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Syllable 1");
  await expect(
    dialog.getByRole("group", { name: "Your word", exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("group", { name: "Reference pronunciation", exact: true }),
  ).toBeVisible();
  const syllable = dialog.getByRole("group", {
    name: "Reference syllable",
    exact: true,
  });
  await syllable.getByRole("button", { name: /^Play / }).click();
  await expect
    .poll(() =>
      syllable.locator("audio").evaluate((a: HTMLAudioElement) => a.paused),
    )
    .toBe(true);
  await dialog.getByRole("button", { name: /Syllable 2/ }).click();
  await expect(dialog).toContainText("Practise syllable 2");
  await expect(
    dialog.getByRole("button", { name: "Record syllable", exact: true }),
  ).toBeDisabled();
  await page.screenshot({ path: info.outputPath("word-practice-desktop.png") });
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Practise word 1: Urban" }),
  ).toBeFocused();
  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(size);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: info.outputPath(`feedback-first-${size.width}.png`),
      animations: "disabled",
    });
    const words: string[] = [];
    const next = page.getByRole("button", { name: "Next prompt word pages" });
    do {
      words.push(
        ...(await page
          .locator(".diff-page .feedback-word > span:first-child")
          .allTextContents()),
      );
      if (!(await next.count()) || (await next.isDisabled())) break;
      await next.click();
    } while (words.length < 100);
    expect(words.join(" ")).toContain("even if it grows quickly.");
    await page.screenshot({
      path: info.outputPath(`feedback-${size.width}.png`),
    });
    await page.reload();
  }
  await page.getByRole("button", { name: "Next review questions" }).click();
  await expect(page.locator(".review-screen")).toHaveAttribute(
    "data-question-id",
    "describe-image-01",
  );
  await page.getByRole("button", { name: "Source", exact: true }).click();
  await expect(page.getByRole("figure")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("group", { name: "Your recording", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next review questions" }).click();
  await page.getByText("Saved transcript", { exact: true }).click();
  await expect(
    page.getByText("The saved transcript stays readable."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Transcribe|Word comparison/ }),
  ).toHaveCount(0);
});
test("no-speech stays unscored, and legacy evidence without a recording remains reviewable", async ({
  page,
  context,
}) => {
  await context.route("**/models/**", (r) => r.abort());
  await seed(page, "no-reliable-speech");
  await expect(page.getByLabel("Local syllable scores")).toContainText(
    "No reliable speech detected",
  );
  await expect(page.getByLabel(/^Reference similarity/)).toHaveCount(0);
  await page.getByRole("button", { name: "Next review questions" }).click();
  await page.getByRole("button", { name: "Next review questions" }).click();
  await expect(
    page.getByText("No recording was saved.", { exact: false }),
  ).toBeVisible();
  await page.getByText("Saved transcript", { exact: true }).click();
  await expect(
    page.getByText("The saved transcript stays readable."),
  ).toBeVisible();
});

test("reference playback follows the saved pronunciation variant when syllable counts differ", async ({
  page,
  context,
}) => {
  await context.route("**/models/**", (r) => r.abort());
  await seed(page, "scored", "en-gb");
  await page
    .getByRole("button", { name: /^Practise word \d+: release/ })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /Syllable 2/ }).click();
  await expect(
    dialog.getByRole("group", { name: "Reference syllable", exact: true }),
  ).toBeVisible();
  const duration = await dialog
    .getByRole("group", { name: "Reference syllable", exact: true })
    .locator("audio")
    .getAttribute("src");
  expect(duration).toContain("read-aloud-01-reference.mp3");
});

test("expanded long legacy transcripts remain complete on desktop and short phones", async ({
  page,
  context,
}) => {
  await context.route("**/models/**", (r) => r.abort());
  await seed(page);
  const text =
    "A saved learner transcript remains available for reading. ".repeat(130) +
    "FINAL SAVED TRANSCRIPT WORDS";
  await page.evaluate(async (text) => {
    await new Promise<void>((resolve, reject) => {
      const r = indexedDB.open("pte-studio", 2);
      r.onerror = () => reject(r.error);
      r.onsuccess = () => {
        const db = r.result,
          tx = db.transaction("attempts", "readwrite"),
          store = tx.objectStore("attempts"),
          get = store.get("feedback");
        get.onsuccess = () => {
          const saved = get.result;
          saved.result.questionIds = ["repeat-sentence-01"];
          saved.result.answers["repeat-sentence-01"].transcription.text = text;
          store.put(saved, "feedback");
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, text);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(base + "history/feedback");
    await page.getByText("Saved transcript", { exact: true }).click();
    const copy = page.getByRole("dialog").locator(".reading-copy"),
      next = page.getByRole("button", { name: "Next detail pages" });
    const parts: string[] = [];
    for (let i = 0; i < 150; i++) {
      await expect
        .poll(() =>
          copy.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
        )
        .toBe(true);
      parts.push(await copy.innerText());
      if (!(await next.count()) || (await next.isDisabled())) break;
      await next.click();
    }
    expect(parts.join(" ").replace(/\s+/g, " ").trim()).toBe(text.trim());
    await expect(copy).toContainText(/WORDS\s*$/);
    await copy.scrollIntoViewIfNeeded();
    await expect(copy).toBeInViewport({ ratio: 1 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
});

test("green, yellow and red colour the syllable letters, with uncertainty neutral and no score chips", async ({
  page,
  context,
}, info) => {
  await context.route("**/models/**", (r) => r.abort());
  await seed(page);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const urban = page.getByRole("button", {
      name: "Practise word 1: Urban",
      exact: true,
    });
    await expect(urban.locator(".syllable-letters")).toHaveText(["Ur", "ban"]);
    await expect(urban).toHaveAccessibleDescription(
      "Syllable 1: uncertain, no score. Syllable 2: 88 out of 100",
    );
    const green = urban.locator('[data-tone="close"]');
    const yellow = page
      .getByRole("button", { name: "Practise word 2: trees", exact: true })
      .locator('[data-tone="developing"]');
    const red = page
      .getByRole("button", { name: "Practise word 3: provide", exact: true })
      .locator('[data-tone="focus"]');
    await expect(green).toHaveText("ban");
    await expect(yellow).toHaveText("trees");
    await expect(red).toHaveText("pro");
    await expect(green).toHaveCSS("color", "rgb(22, 101, 52)");
    await expect(yellow).toHaveCSS("color", "rgb(133, 77, 14)");
    await expect(red).toHaveCSS("color", "rgb(153, 27, 27)");
    await expect(page.locator(".word-syllables")).toHaveCount(0);
    const letters = (
      await page.locator(".diff-page .word-characters").allTextContents()
    ).join(" ");
    expect(letters).not.toMatch(/[?\d]/);
    expect(letters).toContain("Urban trees provide");
    const bounds = await urban.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
    await page.screenshot({
      path: info.outputPath(`coloured-syllables-${viewport.width}.png`),
      animations: "disabled",
    });
    await urban.focus();
    await page.keyboard.press("Enter");
    await expect(
      page
        .getByRole("dialog")
        .getByRole("group", { name: "Your word", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(urban).toBeFocused();
  }
});
