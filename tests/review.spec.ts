import { test, expect, type Page } from "@playwright/test";
import questionData from "../content/questions.json" with { type: "json" };
import guideData from "../content/guides.json" with { type: "json" };
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
          } else if (kind(q) !== "speak")
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
async function select(page: Page, panel: string) {
  const button = page
    .getByRole("group", { name: "Review panels", exact: true })
    .getByRole("button", { name: panel, exact: true });
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
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

test("all 65 questions: complete, incorrect and unanswered review panels on desktop and phone", async ({
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
    for (const state of ["correct", "wrong", "empty"]) {
      await page.goto(`/history/review-${state}`);
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await expect(page.locator(".review-screen")).toHaveAttribute(
          "data-question-id",
          q.id,
        );
        await select(page, "Your response");
        const response = await readPages(page);
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
        else expect(response).toContain("No recording");
        await select(page, "Feedback");
        const feedback = await readPages(
          page,
          kind(q) === "speak" ? "speech review pages" : "feedback pages",
        );
        expect(feedback).toContain(compact(q.explanation));
        expect(feedback).not.toMatch(
          /Preserve the main information|Check the content, form and language|v3 reference model/,
        );
        if (
          kind(q) === "speak" &&
          !["read-aloud", "repeat-sentence"].includes(q.type)
        )
          expect(feedback).toContain(compact(q.model!));
        if (q.prompt || q.text || q.audioText) {
          await select(page, "Prompt");
          const prompt = await readPages(page);
          for (const text of [
            q.prompt,
            kind(q) === "blanks"
              ? undefined
              : q.text?.replace(/\{\{\}\}/g, "GAP"),
            q.audioText,
          ].filter(Boolean)) {
            if (!text!.includes("GAP"))
              expect(prompt).toContain(compact(text!));
          }
          if (q.type === "respond-to-situation")
            expect(prompt.split(compact(q.text!))).toHaveLength(2);
          if (q.audio)
            await expect(
              page.getByRole("group", {
                name: `Prompt recording for question ${i + 1}`,
                exact: true,
              }),
            ).toBeVisible();
        }
        if (q.chart) {
          await select(page, "Image");
          await expect(page.getByRole("figure")).toContainText(q.chart.title);
          for (const value of q.chart.values)
            await expect(page.getByRole("figure")).toContainText(String(value));
        }
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
          await select(
            page,
            kind(q) === "speak" ? "Feedback" : "Your response",
          );
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
  expect(visited).toHaveLength(390);
  await info.attach("all-question-review-coverage", {
    body: JSON.stringify(visited),
    contentType: "application/json",
  });
});

test("mixed mock and section reviews retain navigation, panel fallback, keyboard and reload", async ({
  page,
  context,
}) => {
  await context.route("**/models/**", (route) => route.abort());
  await seed(page);
  for (const id of [
    "mock",
    "section-speaking",
    "section-reading",
    "section-listening",
  ]) {
    await page.goto(`/history/review-${id}`);
    await expect(page.locator(".review-screen")).toBeVisible();
    await page.getByRole("button", { name: "Feedback", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("button", { name: "Feedback", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page
      .getByRole("button", { name: "Next review questions", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Feedback", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.locator(".review-screen")).toBeVisible();
  }
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
  await select(page, "Prompt");
  const audio = page.getByRole("group", {
    name: "Prompt recording for question 2",
    exact: true,
  });
  await audio.getByRole("button", { name: /Play/ }).click();
  await expect(audio.getByRole("button", { name: /Pause/ })).toBeVisible();
  await select(page, "Feedback");
  await expect(page.locator(".review-screen audio")).toHaveCount(0);
  await select(page, "Prompt");
  await audio.getByRole("button", { name: /Play/ }).click();
  await expect(audio.getByRole("button", { name: /Pause/ })).toBeVisible();
  await page
    .getByRole("button", { name: "Next review questions", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Feedback", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await select(page, "Image");
  await page
    .getByRole("button", { name: "Next review questions", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Your response", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
