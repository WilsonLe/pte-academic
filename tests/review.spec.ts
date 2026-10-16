import { test, expect, type Page } from "@playwright/test";
import questionData from "../content/questions.json" with { type: "json" };
import guideData from "../content/guides.json" with { type: "json" };
import references from "../src/speech/reference-clips.json" with { type: "json" };
import {
  COMPARISON_MODEL_SHA,
  COMPARISON_EXPORT,
} from "../src/speech/comparison-schema";
import mocks from "../content/mock-tests.json" with { type: "json" };
import type { Answer, Question } from "../src/content";
const questions = questionData as Question[];
const kind = (q: Question) => guideData.find((g) => g.id === q.type)!.kind;
const compact = (s: string) => s.replace(/\s+/g, " ").trim();

async function seed(page: Page) {
  await page.goto("/");
  const answers = (state: string) =>
    Object.fromEntries(
      questions.map((q) => {
        let a: Answer = {};
        if (state !== "empty") {
          if (q.answers) {
            const wrongOption = String(
              q.options?.findIndex((_, i) => !q.answers!.includes(String(i))) ??
                0,
            );
            const wrong =
              kind(q) === "order"
                ? [...q.answers].reverse()
                : kind(q) === "single"
                  ? [wrongOption]
                  : kind(q) === "multi"
                    ? [q.answers[0], wrongOption]
                    : kind(q) === "highlight"
                      ? ["0"]
                      : ["wrong", ""];
            a = { values: state === "correct" ? q.answers : wrong };
          } else if (["read-aloud", "repeat-sentence"].includes(q.type)) {
            a = {
              pronunciation: {
                schemaVersion: 1,
                modelSha256: COMPARISON_MODEL_SHA,
                exportId: COMPARISON_EXPORT,
                referenceAccents: ["en-US", "en-GB", "en-AU", "en-IN"],
                seconds: 40,
                status: "scored",
                syllables: references[
                  q.id as keyof typeof references
                ].syllables.map((s) => ({
                  ...s,
                  similarity: 75,
                  confidence: 0.8,
                  status: "scored",
                })),
              },
            };
          } else if (kind(q) === "speak")
            a = {
              transcription: {
                text: "Saved spoken response",
                seconds: 3,
                engine: "legacy-local",
                model: "legacy",
                revision: "old",
              },
            };
          else if (kind(q) !== "speak")
            a = { text: state === "correct" ? q.model : "A short response." };
        }
        return [q.id, a];
      }),
    );
  const attempts = ["empty", "correct", "wrong"].map((state) => ({
    id: `review-${state}`,
    label: `${state} review`,
    date: new Date().toISOString(),
    questionIds: questions.map((q) => q.id),
    answers: answers(state),
    finished: state !== "empty",
  }));
  attempts.push({
    ...attempts[1],
    id: "review-mock",
    questionIds: mocks[0].questionIds,
  });
  for (const section of ["speaking", "reading", "listening"])
    attempts.push({
      ...attempts[1],
      id: `review-section-${section}`,
      questionIds: questions
        .filter(
          (q) => guideData.find((g) => g.id === q.type)!.section === section,
        )
        .map((q) => q.id),
    });
  await page.evaluate(async (attempts) => {
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
        for (const result of attempts)
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
      JSON.stringify(attempts.map((r) => ({ ...r, answers: {} }))),
    );
  }, attempts);
}

async function readPages(page: Page, label = "feedback pages") {
  const copy = page.locator(".review-screen .reading-copy");
  const next = page.getByRole("button", { name: `Next ${label}`, exact: true });
  const parts: string[] = [];
  const labels = new Set<string>();
  for (let i = 0; i < 150; i++) {
    await expect(copy).toBeVisible();
    await expect
      .poll(() => copy.evaluate((el) => el.scrollHeight <= el.clientHeight + 1))
      .toBe(true);
    parts.push(
      (await copy.locator(".reading-block p").allTextContents()).join(" "),
    );
    for (const text of await copy.locator("h3").allTextContents())
      labels.add(text.replace(/ \(continued\)/g, ""));
    if (!(await next.count()) || (await next.isDisabled()))
      return compact(parts.join(" ")) + " " + [...labels].join(" ");
    await next.click();
  }
  throw new Error("Review pagination did not reach the final page");
}
async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const box = await page.locator(".review-screen").boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
}

test("all 65 questions: unified complete and incorrect feedback on desktop and phone", async ({
  page,
  context,
}, info) => {
  test.setTimeout(480000);
  await context.route("**/models/**", (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page);
  const visited: string[] = [];
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const state of ["correct", "wrong"]) {
      await page.goto(`/history/review-${state}`);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await expect(page.locator(".review-screen")).toHaveAttribute(
          "data-question-id",
          q.id,
        );
        await expect(
          page.getByRole("heading", { name: "Feedback", exact: true }),
        ).toBeVisible();
        const fixedSpeech = ["read-aloud", "repeat-sentence"].includes(q.type);
        const response = fixedSpeech ? "" : await readPages(page);
        if (kind(q) === "write") {
          expect(response).toContain(
            q.type === "write-essay" ? "Planning outline" : "Example response",
          );
          expect(response).toContain(compact(q.model!));
          expect(response).not.toContain("Answer key");
        } else if (kind(q) === "order") {
          expect(response).toContain(
            state === "correct" ? "Your order" : "Correct order",
          );
          for (const value of q.answers!)
            expect(response).toContain(compact(q.options![Number(value)]));
        } else if (["dropdown", "bank", "blanks"].includes(kind(q))) {
          for (let gap = 0; gap < q.answers!.length; gap++) {
            expect(response).toContain(`Gap ${gap + 1}`);
            expect(response).toContain(q.answers![gap]);
          }
        } else if (["single", "multi"].includes(kind(q))) {
          for (const option of q.options!)
            expect(response).toContain(compact(option));
        } else if (kind(q) === "highlight") {
          for (const value of q.answers!) {
            const n = Number(value);
            expect(response).toContain(`Word ${n + 1}`);
            expect(response).toContain(q.audioText!.split(/\s+/)[n]);
          }
        } else if (kind(q) === "dictation")
          expect(response).toContain(compact(q.model!));
        else if (!fixedSpeech) expect(response).toContain("No recording");
        if (!fixedSpeech) {
          expect(response).toContain(compact(q.explanation));
          if (kind(q) === "speak")
            expect(response).toContain(compact(q.model!));
          for (const text of [q.prompt, q.audioText].filter(Boolean))
            expect(response).toContain(compact(text!));
        } else {
          await expect(page.getByLabel("Local syllable scores")).toContainText(
            "syllables scored",
          );
        }
        if (q.audio)
          await expect(
            page.getByRole("group", {
              name: "Prompt recording",
              exact: true,
            }),
          ).toBeVisible();
        if (q.chart)
          await expect(page.getByRole("figure")).toContainText(q.chart.title);
        await fits(page);
        visited.push(`${viewport.width}/${state}/${q.id}`);
        if (
          state === "wrong" &&
          viewport.width === 390 &&
          [
            "reading-multiple-01",
            "reading-dropdown-01",
            "highlight-incorrect-01",
            "write-essay-01",
            "describe-image-01",
          ].includes(q.id)
        ) {
          await page.screenshot({
            path: info.outputPath(`${q.id}-mobile.png`),
          });
        }
        if (i < questions.length - 1)
          await page
            .getByRole("button", { name: "Next review questions", exact: true })
            .click();
      }
    }
  }
  expect(visited).toHaveLength(260);
  await info.attach("all-question-review-coverage", {
    body: JSON.stringify(visited),
    contentType: "application/json",
  });
});

test("answered-only reviews hide single-page navigation, and empty sessions have no questions", async ({
  page,
  context,
}) => {
  await context.route("**/models/**", (r) => r.abort());
  await seed(page);
  await page.goto("/history/review-empty");
  await expect(
    page.getByText("No responses were saved in this session."),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "review questions" }),
  ).toHaveCount(0);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const r = indexedDB.open("pte-studio", 2);
      r.onsuccess = () => {
        const db = r.result,
          tx = db.transaction("attempts", "readwrite"),
          store = tx.objectStore("attempts");
        const get = store.get("review-correct");
        get.onsuccess = () => {
          const saved = get.result;
          saved.result.answers = { "reading-single-01": { values: ["0"] } };
          saved.recordings = {};
          store.put(saved, "review-correct");
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await page.goto("/history/review-correct");
  await expect(page.locator(".review-screen")).toHaveAttribute(
    "data-question-id",
    "reading-single-01",
  );
  await expect(
    page.getByRole("navigation", { name: "review questions" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".review-screen")).toHaveAttribute(
    "data-question-id",
    "reading-single-01",
  );
});

test("long writing remains complete on short phones and enlarged text; source audio replays", async ({
  page,
  context,
}, info) => {
  await context.route("**/models/**", (route) => route.abort());
  await seed(page);
  const text =
    "The argument explains how theory informs practical decisions. ".repeat(
      70,
    ) + "FINAL RESPONSE WORDS";
  await page.evaluate(async (text) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("pte-studio", 2);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("attempts", "readwrite");
      const r = tx.objectStore("attempts").get("review-wrong");
      r.onsuccess = () => {
        const value = r.result;
        value.result.questionIds = [
          "write-essay-01",
          "listening-single-01",
          "describe-image-01",
          "reading-single-01",
        ];
        value.result.answers["write-essay-01"] = { text };
        tx.objectStore("attempts").put(value, "review-wrong");
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  }, text);
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 640, height: 400 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/history/review-wrong");
    if (viewport.height === 400)
      await page.addStyleTag({
        content: ".reading-copy { font-size: 28px; line-height: 42px; }",
      });
    const complete = await readPages(page);
    expect(complete).toContain(compact(text));
    expect(complete).toContain("Planning outline");
    await page.screenshot({
      path: info.outputPath(`essay-${viewport.height}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/history/review-wrong");
  await page
    .getByRole("button", { name: "Next review questions", exact: true })
    .click();
  const audio = page.getByRole("group", {
    name: "Prompt recording",
    exact: true,
  });
  await audio.getByRole("button", { name: /Play/ }).click();
  await expect(audio.getByRole("button", { name: /Pause/ })).toBeVisible();
  await audio.getByRole("button", { name: /Pause/ }).click();
  await audio.getByRole("button", { name: /Play/ }).click();
  await expect(audio.getByRole("button", { name: /Pause/ })).toBeVisible();
  await page
    .getByRole("button", { name: "Next review questions", exact: true })
    .click();
  await expect(page.getByRole("figure")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Feedback", exact: true }),
  ).toBeVisible();
});

test("playtest: small-phone feedback keeps numbered paragraphs and sentences intact", async ({
  page,
  context,
}) => {
  await context.route("**/models/**", (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page);
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("pte-studio", 2);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("attempts", "readwrite");
        const get = tx.objectStore("attempts").get("review-wrong");
        get.onsuccess = () => {
          const saved = get.result;
          saved.result.questionIds = ["reorder-paragraphs-01"];
          saved.result.answers = { "reorder-paragraphs-01": { values: ["1"] } };
          tx.objectStore("attempts").put(saved, "review-wrong");
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/history/review-wrong");
  const parts: string[] = [];
  for (let i = 0; i < 30; i++) {
    const copy = page.locator(".review-screen .reading-copy");
    await expect(copy.locator("p").first()).toBeVisible();
    await expect
      .poll(() => copy.evaluate((el) => el.scrollHeight <= el.clientHeight + 1))
      .toBe(true);
    parts.push((await copy.locator("p").allTextContents()).join(" "));
    const next = page.getByRole("button", {
      name: "Next feedback pages",
      exact: true,
    });
    await expect(
      page.getByRole("navigation", { name: "feedback pages", exact: true }),
    ).toContainText("Feedback");
    if (!(await next.count()) || (await next.isDisabled())) break;
    await next.click();
  }
  const q = questions.find((q) => q.id === "reorder-paragraphs-01")!;
  for (const [i, value] of q.answers!.entries()) {
    expect(
      parts.some((part) =>
        part.includes(`${i + 1}. ${q.options![Number(value)]}`),
      ),
    ).toBe(true);
  }
  expect(
    parts.some((part) =>
      part.includes(
        "“This cycle” refers to returning seeds and explains how the collection continues.",
      ),
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/history/review-wrong");
  const complete = await readPages(page);
  expect(complete).toContain(compact(q.explanation));
  await page.goto("/history/review-correct");
  await expect(
    page.getByRole("navigation", { name: "review questions", exact: true }),
  ).toContainText("Question");
});
