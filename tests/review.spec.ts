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

async function readDetails(page: Page) {
  const dialog = page.getByRole("dialog");
  const copy = dialog.locator(".reading-copy");
  const parts: string[] = [];
  const labels = new Set<string>();
  for (let i = 0; i < 200; i++) {
    await expect(copy).toBeVisible();
    await expect
      .poll(() => copy.evaluate((el) => el.scrollHeight <= el.clientHeight + 1))
      .toBe(true);
    parts.push(
      (await copy.locator(".reading-block p").allTextContents()).join(" "),
    );
    for (const label of await copy.locator("h3").allTextContents())
      labels.add(label.replace(/ \(continued\)/g, ""));
    const next = dialog.getByRole("button", {
      name: "Next detail pages",
      exact: true,
    });
    if (!(await next.count()) || (await next.isDisabled()))
      return compact(parts.join(" ")) + " " + [...labels].join(" ");
    await next.click();
  }
  throw new Error("Detail pagination did not end");
}
async function readComparisons(page: Page, inspect = true) {
  await expect(page.locator(".friendly-feedback")).toBeVisible();
  if (
    await page
      .getByRole("region", { name: "Written response", exact: true })
      .count()
  ) {
    const parts: string[] = [];
    const copy = page.locator(".written-response .reading-copy");
    for (let i = 0; i < 150; i++) {
      await expect(copy).toBeVisible();
      await expect
        .poll(() =>
          copy.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
        )
        .toBe(true);
      parts.push(
        (await copy.locator(".reading-block p").allTextContents()).join(" "),
      );
      const next = page.getByRole("button", {
        name: "Next feedback pages",
        exact: true,
      });
      if (!(await next.count()) || (await next.isDisabled())) {
        if (inspect) {
          const details = page.getByRole("button", {
            name: "Open response details",
            exact: true,
          });
          await details.click();
          parts.push(await readDetails(page));
          await page.keyboard.press("Escape");
          await expect(details).toBeFocused();
        }
        return compact(parts.join(" "));
      }
      await next.click();
    }
    throw new Error("Written response pagination did not end");
  }
  const parts: string[] = [];
  for (let i = 0; i < 150; i++) {
    const cards = page.locator(".friendly-feedback .comparison-card");
    await expect(cards.first()).toBeVisible();
    for (const card of await cards.all()) {
      parts.push(await card.innerText());
      if (inspect) {
        const trigger = (await card.evaluate((el) => el.tagName === "BUTTON"))
          ? card
          : card.getByRole("button").first();
        await trigger.click();
        parts.push(await readDetails(page));
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(trigger).toBeFocused();
      }
    }
    const next = page.getByRole("button", {
      name: "Next feedback pages",
      exact: true,
    });
    if (!(await next.count()) || (await next.isDisabled()))
      return compact(parts.join(" "));
    await next.click();
  }
  throw new Error("Comparison pagination did not end");
}
async function readSource(page: Page) {
  const source = page.getByRole("button", { name: /^(Open source|Source)$/ });
  if (!(await source.count())) return "";
  await source.click();
  const text = await readDetails(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return text;
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

test("all 65 questions: contextual comparisons and disclosed explanations across all 22 types", async ({
  page,
  context,
}, info) => {
  test.setTimeout(480000);
  await context.route("**/models/**", (r) => r.abort());
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
        const q = questions[i],
          fixed = ["read-aloud", "repeat-sentence"].includes(q.type);
        await expect(page.locator(".review-screen")).toHaveAttribute(
          "data-question-id",
          q.id,
        );
        await expect(
          page.getByRole("heading", { name: "Feedback", exact: true }),
        ).toBeVisible();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(
          page.getByRole("heading", {
            name: /^(Your order|Correct order|Why)$/,
          }),
        ).toHaveCount(0);
        let response = "";
        if (fixed) {
          await expect(page.getByLabel("Local syllable scores")).toContainText(
            "syllables scored",
          );
          const word = page
            .getByRole("button", { name: /^Practise word / })
            .first();
          await word.click();
          await expect(page.getByRole("dialog")).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(page.getByRole("dialog")).toHaveCount(0);
        } else {
          await expect(page.locator(".friendly-feedback")).toBeVisible();
          await expect(
            page.getByText(q.explanation, { exact: true }),
          ).toHaveCount(0);
          response = await readComparisons(page);
          if (kind(q) === "order") {
            for (const reason of q.orderExplanations!)
              expect(response).toContain(compact(reason));
            for (const value of q.answers!)
              expect(response).toContain(compact(q.options![Number(value)]));
          } else {
            expect(response).toContain(compact(q.explanation));
            if (["single", "multi"].includes(kind(q)))
              for (const option of q.options!)
                expect(response).toContain(compact(option));
            if (["dropdown", "bank", "blanks"].includes(kind(q)))
              for (const key of q.answers!) expect(response).toContain(key);
            if (kind(q) === "write" || kind(q) === "speak") {
              expect(response).toContain(compact(q.model!));
              await expect(
                page.locator(".friendly-feedback .diff-bad"),
              ).toHaveCount(0);
              await expect(
                page.locator(".friendly-feedback .diff-good"),
              ).toHaveCount(0);
              if (q.type === "write-essay")
                expect(response).toContain("Planning outline");
            }
          }
        }
        const source = await readSource(page);
        for (const text of [q.prompt, q.audioText].filter(Boolean))
          expect(source).toContain(compact(text!));
        if (q.audio)
          await expect(
            page.getByRole("group", { name: "Prompt recording", exact: true }),
          ).toHaveCount(1);
        await fits(page);
        if (
          viewport.width === 390 &&
          state === "wrong" &&
          [
            "reorder-paragraphs-01",
            "reading-dropdown-01",
            "write-essay-01",
            "write-dictation-01",
          ].includes(q.id)
        ) {
          await page.screenshot({
            path: info.outputPath(`${q.id}-mobile.png`),
            animations: "disabled",
          });
        }
        visited.push(`${viewport.width}/${state}/${q.id}`);
        if (i < questions.length - 1)
          await page
            .getByRole("button", { name: "Next review questions", exact: true })
            .click();
      }
    }
  }
  expect(visited).toHaveLength(260);
  await info.attach("all-type-feedback-coverage", {
    body: JSON.stringify(visited),
    contentType: "application/json",
  });
});

test("answered-only reviews retain empty and single-question behavior", async ({
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
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("pte-studio", 2);
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("attempts", "readwrite"),
        store = tx.objectStore("attempts"),
        get = store.get("review-correct");
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
  expect(await readComparisons(page)).toContain(
    "Difficulty scheduling early meetings",
  );
});

test("long writing and enlarged text remain complete; source audio stays outside disclosures", async ({
  page,
  context,
}, info) => {
  await context.route("**/models/**", (r) => r.abort());
  await seed(page);
  const text =
    "The argument explains how theory informs practical decisions. ".repeat(
      70,
    ) + "FINAL RESPONSE WORDS";
  await page.evaluate(async (text) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("pte-studio", 2);
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise<void>((resolve) => {
      const tx = db.transaction("attempts", "readwrite"),
        store = tx.objectStore("attempts"),
        get = store.get("review-wrong");
      get.onsuccess = () => {
        const saved = get.result;
        saved.result.questionIds = ["write-essay-01", "listening-single-01"];
        saved.result.answers["write-essay-01"] = { text };
        store.put(saved, "review-wrong");
      };
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
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
        content:
          ".written-response .reading-copy { font-size:28px; line-height:42px; }",
      });
    const response = await readComparisons(page, false);
    expect(compact(response)).toBe(compact(text));
    await expect(
      page.getByRole("region", { name: "Written response", exact: true }),
    ).toHaveCount(1);
    await expect(
      page.locator(".friendly-feedback .comparison-card"),
    ).toHaveCount(0);
    await fits(page);
    await page.screenshot({
      path: info.outputPath(`writing-${viewport.height}.png`),
      animations: "disabled",
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
  await page.getByRole("button", { name: "Open source", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Prompt recording", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(audio).toBeVisible();
});

test("reorder diff reveals each neighbouring-link rationale only after selection", async ({
  page,
  context,
}, info) => {
  await context.route("**/models/**", (r) => r.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page);
  const q = questions.find((q) => q.id === "reorder-paragraphs-01")!;
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/history/review-wrong");
    const position = questions.findIndex((x) => x.id === q.id);
    for (let i = 0; i < position; i++)
      await page
        .getByRole("button", { name: "Next review questions", exact: true })
        .click();
    await expect(
      page.getByText(q.orderExplanations![0], { exact: true }),
    ).toHaveCount(0);
    const response = await readComparisons(page);
    for (const reason of q.orderExplanations!)
      expect(response).toContain(compact(reason));
    await expect(
      page.getByRole("heading", { name: /^(Your order|Correct order|Why)$/ }),
    ).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath(`reorder-diff-${viewport.width}.png`),
      animations: "disabled",
    });
  }
});

test("all seven speaking types retain acoustic word selection and disclose missing-word uncertainty", async ({
  page,
  context,
}) => {
  await context.route("**/models/**", (r) => r.abort());
  await seed(page);
  const spoken = guideData
    .filter((g) => g.kind === "speak")
    .map((g) => questions.find((q) => q.type === g.id)!.id);
  await page.evaluate(
    async ({ spoken, sha, exportId }) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const r = indexedDB.open("pte-studio", 2);
        r.onsuccess = () => resolve(r.result);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction("attempts", "readwrite"),
          store = tx.objectStore("attempts"),
          get = store.get("review-correct");
        get.onsuccess = () => {
          const saved = get.result;
          saved.result.questionIds = spoken;
          saved.result.answers = Object.fromEntries(
            spoken.map((id) => [
              id,
              {
                speechAssessment: {
                  schemaVersion: 1,
                  modelSha256: sha,
                  exportId,
                  referenceAccents: ["en-US", "en-GB", "en-AU", "en-IN"],
                  seconds: 3,
                  status: "unscored",
                  syllables: [],
                  recognition: {
                    modelId: "audio-only-words-v1",
                    words: [
                      {
                        word: "urban",
                        index: 0,
                        start: 0,
                        end: 1,
                        confidence: 0.8,
                        status: "recognized",
                      },
                    ],
                  },
                },
              },
            ]),
          );
          saved.recordings = {};
          store.put(saved, "review-correct");
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      });
    },
    { spoken, sha: COMPARISON_MODEL_SHA, exportId: COMPARISON_EXPORT },
  );
  await page.goto("/history/review-correct");
  for (let i = 0; i < spoken.length; i++) {
    await expect(page.locator(".review-screen")).toHaveAttribute(
      "data-question-id",
      spoken[i],
    );
    const word = page
      .getByRole("button", { name: /^Practise word 1:/ })
      .first();
    await word.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const omitted = page
      .getByRole("button", { name: /^Not heard:.*Explain$/ })
      .first();
    if (await omitted.count()) {
      await omitted.click();
      await expect(page.getByRole("dialog")).toContainText(
        "not a pronunciation grade",
      );
      await expect(
        page
          .getByRole("dialog")
          .getByRole("button", { name: "Record syllable", exact: true }),
      ).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    const source = await readSource(page);
    expect(source).toContain(
      compact(questions.find((q) => q.id === spoken[i])!.explanation),
    );
    if (i < spoken.length - 1)
      await page
        .getByRole("button", { name: "Next review questions", exact: true })
        .click();
  }
});

test("playtest: all writing types share one paragraph-preserving response and disclosed alternatives", async ({
  page,
  context,
}) => {
  await context.route("**/models/**", (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page);
  const writing = questions.filter((q) => kind(q) === "write");
  const paragraphs = [
    "Academic knowledge helps students understand unfamiliar problems. It offers a foundation for evaluating evidence and explaining decisions. Students can then connect new information to ideas they have already studied.",
    "Practical projects give students an opportunity to apply these ideas. A placement can expose gaps in understanding and encourage reflection. Working with others also develops communication and planning skills.",
    "Universities should combine both approaches. Theory and experience together prepare students to adapt as their circumstances change.",
  ];
  const text = paragraphs.join("\n\n");
  await page.evaluate(
    async ({ ids, text }) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const request = indexedDB.open("pte-studio", 2);
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve) => {
        const tx = db.transaction("attempts", "readwrite");
        const store = tx.objectStore("attempts");
        const get = store.get("review-wrong");
        get.onsuccess = () => {
          const saved = get.result;
          saved.result.questionIds = ids;
          saved.result.answers = Object.fromEntries(
            ids.map((id) => [id, { text }]),
          );
          store.put(saved, "review-wrong");
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      });
    },
    { ids: writing.map((q) => q.id), text },
  );
  for (const size of [
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/history/review-wrong");
    for (let i = 0; i < writing.length; i++) {
      await expect(page.locator(".review-screen")).toHaveAttribute(
        "data-question-id",
        writing[i].id,
      );
      const response = page.getByRole("region", {
        name: "Written response",
        exact: true,
      });
      await expect(response).toHaveCount(1);
      await expect(page.locator(".comparison-card")).toHaveCount(0);
      await expect(
        page.getByText(writing[i].explanation, { exact: true }),
      ).toHaveCount(0);
      // This whole first paragraph fits in the actual panel; it must not be
      // chopped into the old 180-character response cards.
      await expect(response.locator(".reading-block p").first()).toContainText(
        paragraphs[0],
      );
      expect(await readComparisons(page, false)).toBe(compact(text));
      const details = page.getByRole("button", {
        name: "Open response details",
        exact: true,
      });
      await details.click();
      const detail = await readDetails(page);
      expect(detail).toContain(compact(writing[i].model!));
      expect(detail).toContain(compact(writing[i].explanation));
      if (writing[i].type === "write-essay")
        expect(detail).toContain("Planning outline");
      await page.keyboard.press("Escape");
      await expect(details).toBeFocused();
      if (i < writing.length - 1)
        await page
          .getByRole("button", { name: "Next review questions", exact: true })
          .click();
    }
    await page.reload();
    await expect(page.locator(".review-screen")).toHaveAttribute(
      "data-question-id",
      writing[0].id,
    );
    expect(await readComparisons(page, false)).toBe(compact(text));
  }
});
