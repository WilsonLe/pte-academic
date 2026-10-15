import { test, expect, type Page } from "@playwright/test";
async function drill(page: Page, name: string) {
  await page.goto("/#types");
  await page.getByRole("searchbox").fill(name.replaceAll("\\", ""));
  await page
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
}
async function start(page: Page) {
  await expect(
    page.getByRole("button", { name: "Begin practice", exact: true }),
  ).toBeVisible();
  const checkbox = page.getByRole("checkbox", {
    name: "I can hear the audio clearly",
  });
  if (await checkbox.count()) await checkbox.check();
  await page
    .getByRole("button", { name: "Begin practice", exact: true })
    .click();
  await expect(page.locator(".exam")).toBeVisible();
}
async function end(page: Page) {
  await page.getByRole("button", { name: "End practice", exact: true }).click();
  await page.getByRole("button", { name: "End & review", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review", exact: true }),
  ).toBeVisible();
}
async function screenFits(page: Page) {
  expect(
    await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    })),
  ).toEqual(
    await page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
  );
  const bad = await page
    .locator("main button, main a, main input, main select")
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => {
          const r = node.getBoundingClientRect(),
            parent = document.querySelector("main")!.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            (r.top < parent.top - 1 ||
              r.bottom > parent.bottom + 1 ||
              r.left < parent.left - 1 ||
              r.right > parent.right + 1)
          );
        })
        .map((n) => n.textContent || n.getAttribute("aria-label")),
    );
  expect(bad).toEqual([]);
}
test("shared cards list fits responsive panels and exposes every question type", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const size of [
    { width: 1440, height: 900 },
    { width: 980, height: 960 },
    { width: 820, height: 768 },
    { width: 767, height: 844 },
    { width: 640, height: 844 },
    { width: 390, height: 844 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/#types");
    await page.reload();
    await expect(page.locator(".type-row").first()).toBeVisible();
    const titles = new Set<string>();
    for (let i = 0; i < 22; i++) {
      await screenFits(page);
      const cards = await page.locator(".type-row").evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          const title = node.querySelector(".flex-1") as HTMLElement;
          return {
            title: node.getAttribute("data-track") + ":" + title.textContent!,
            width: box.width,
            height: box.height,
            fits:
              title.scrollWidth <= title.clientWidth &&
              title.scrollHeight <= node.clientHeight,
          };
        }),
      );
      for (const card of cards) {
        titles.add(card.title);
        expect(card.width).toBeGreaterThan(270);
        expect(card.height).toBeGreaterThanOrEqual(119);
        expect(card.height).toBeLessThanOrEqual(177);
        expect(card.fits).toBe(true);
      }
      const next = page.getByRole("button", {
        name: "Next question type pages",
      });
      if (await next.isDisabled()) break;
      await next.click();
    }
    expect(titles.size).toBe(22);
  }
});

test("shared cards list hides unnecessary pagination and preserves navigation on resize", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#types");
  const next = page.getByRole("button", { name: "Next question type pages" });
  await next.click();
  const anchor = await page
    .locator(".type-row > .flex-1")
    .first()
    .textContent();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".cards-list-grid")).toContainText(anchor!);
  const title = await page.locator(".type-row > .flex-1").first().textContent();
  await page.locator(".type-row").first().click();
  await page.getByRole("button", { name: "All question types" }).click();
  await expect(page.locator(".type-row > .flex-1").first()).toHaveText(title!);
  await page.getByRole("searchbox").fill("Read Aloud");
  await expect(page.locator(".type-row")).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "question type pages", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("searchbox").fill("no matching question type");
  await expect(page.getByText("No question types found.")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "question type pages", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(
    page.getByRole("button", { name: "Previous question type pages" }),
  ).toBeDisabled();
  await page.goto("/#history");
  await expect(page.getByText("No attempts yet.")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "attempt pages", exact: true }),
  ).toHaveCount(0);
  await page.goto("/#guide");
  await expect(
    page.locator(".cards-list-grid .type-row").first(),
  ).toBeVisible();
  await page.goto("/#home");
  await expect(page.locator(".cards-list-grid .game-mode")).toHaveCount(3);
  await expect(
    page.getByRole("navigation", { name: "practice mode pages", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "View achievements" }).click();
  await expect(page.locator(".cards-list-grid .achievement")).toHaveCount(4);
  const achievementNext = page.getByRole("button", {
    name: "Next achievement pages",
  });
  await achievementNext.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("navigation", { name: "achievement pages", exact: true }),
  ).toContainText("2 / 2");
  await expect(page.locator(".achievement")).toHaveCount(2);
  await page.locator(".achievement").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator(".achievement")).toHaveCount(6);
  await expect(
    page.getByRole("navigation", { name: "achievement pages", exact: true }),
  ).toHaveCount(0);
  await screenFits(page);
});

test("shared cards list pages learning topics and history and retains a short-window escape", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/#guide");
  const topics = new Set<string>();
  for (let i = 0; i < 10; i++) {
    for (const title of await page.locator(".type-row").allTextContents())
      topics.add(title);
    await screenFits(page);
    const next = page.getByRole("button", { name: "Next learning topics" });
    if (!(await next.count()) || (await next.isDisabled())) break;
    await next.click();
  }
  const { readFile } = await import("node:fs/promises");
  const sourceTopics = JSON.parse(
    await readFile(new URL("../content/learn.json", import.meta.url), "utf8"),
  );
  expect(topics.size).toBe(sourceTopics.length);
  await page.locator(".type-row").first().click();
  await expect(page.locator(".reading-copy")).toBeVisible();
  await page.getByRole("button", { name: "All learning topics" }).click();
  await expect(page.locator(".cards-list-grid")).toBeVisible();

  await page.evaluate(() =>
    localStorage.setItem(
      "pte-studio-history-v1",
      JSON.stringify(
        Array.from({ length: 10 }, (_, i) => ({
          id: `cards-fixture-${i}`,
          label: `Practice round ${i + 1}`,
          date: "2026-10-15T00:00:00.000Z",
          questionIds: ["reading-single-01"],
          answers: {},
          finished: true,
        })),
      ),
    ),
  );
  await page.goto("/#history");
  await page.reload();
  const rounds = new Set<string>();
  for (let i = 0; i < 10; i++) {
    for (const title of await page
      .locator(".history-row .flex-1")
      .allTextContents())
      rounds.add(title);
    await screenFits(page);
    const next = page.getByRole("button", { name: "Next attempt pages" });
    if (await next.isDisabled()) break;
    await next.click();
  }
  expect(rounds.size).toBe(10);
  await page.setViewportSize({ width: 360, height: 400 });
  await page.goto("/#types");
  const next = page.getByRole("button", { name: "Next question type pages" });
  await next.scrollIntoViewIfNeeded();
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("navigation", { name: "question type pages", exact: true }),
  ).toContainText("2 /");
});

test("screen-sized game navigation, all question pages and beginner guidance", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 1101, height: 768 },
    { width: 1120, height: 768 },
    { width: 1201, height: 768 },
    { width: 390, height: 844 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(size);
    for (const route of [
      "home",
      "types",
      "sections",
      "mocks",
      "guide",
      "history",
    ]) {
      await page.goto("/#" + route);
      await expect(page.locator("main")).toBeVisible();
      await screenFits(page);
      await expect
        .poll(() =>
          page
            .locator(".cards-list")
            .evaluateAll((nodes) =>
              nodes.every((node) => node.scrollHeight <= node.clientHeight + 1),
            ),
        )
        .toBe(true);
    }
    await page.goto("/#home");
    await page.getByRole("button", { name: "View level and streak" }).click();
    await expect(
      page.getByRole("region", { name: "Practice level" }),
    ).toBeVisible();
    await screenFits(page);
    await page.getByRole("button", { name: "View achievements" }).click();
    await expect(
      page.getByRole("button", {
        name: "First spark, not earned. View achievement",
      }),
    ).toBeVisible();
    await screenFits(page);
    await page.getByRole("button", { name: "Practice screen" }).click();
    await page
      .getByRole("navigation", {
        name: size.width > 767 ? "Main navigation" : "Mobile navigation",
        exact: true,
      })
      .getByRole("link", {
        name: size.width > 767 ? "Learn about PTE" : "Learn",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "Start with the basics" }).click();
    await expect(
      page.getByRole("heading", { name: "Start with the basics" }),
    ).toBeVisible();
    await expect(page.locator(".reading-copy")).toBeVisible();
    await screenFits(page);
    await expect
      .poll(() =>
        page
          .locator(".reading-copy")
          .evaluate((e) => e.scrollHeight <= e.clientHeight),
      )
      .toBe(true);
  }
  await page.goto("/#types");
  const titles = new Set<string>();
  do {
    for (const text of await page
      .locator(".type-row")
      .evaluateAll((nodes) =>
        nodes.map(
          (node) =>
            node.getAttribute("data-track") +
            ":" +
            node.querySelector("span.flex-1")?.textContent,
        ),
      ))
      titles.add(text);
    const next = page.getByRole("button", { name: "Next question type pages" });
    if (await next.isDisabled()) break;
    await next.click();
  } while (true);
  expect(titles.size).toBe(22);
  const lastType = await page
    .locator(".type-row > span.flex-1")
    .first()
    .textContent();
  await page.locator(".type-row").first().click();
  await page.getByRole("button", { name: "All question types" }).click();
  await expect(page.locator(".type-row > span.flex-1").first()).toHaveText(
    lastType!,
  );
  await page.getByRole("searchbox").fill("nonsense");
  await expect(page.getByText("No question types found.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("button", { name: /^Read Aloud/ }).click();
  await expect(page.getByText(/Read the text silently/)).toBeHidden();
  await page.getByRole("button", { name: "Instructions", exact: true }).click();
  await expect(page.getByText(/Read the text silently/)).toBeVisible();
  await page
    .getByRole("button", { name: "Strategy & tips", exact: true })
    .click();
  await screenFits(page);
  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/#home");
    await settleView(page);
    await page.screenshot({
      path:
        "docs/evidence/overview-" +
        (size.width > 767 ? "desktop" : "mobile") +
        ".png",
      animations: "disabled",
    });
  }
});
test("single answer submits once and persisted review survives reload", async ({
  page,
}) => {
  await drill(page, "Multiple Choice, Single Answer");
  await start(page);
  await page
    .getByRole("radio", { name: "Difficulty scheduling early meetings" })
    .check();
  await page.screenshot({
    path: "docs/evidence/exam-reading.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("2 of 2", { exact: true })).toBeVisible();
  await page
    .getByRole("radio", {
      name: "River health can improve within urban constraints.",
    })
    .check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("Correct", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next review questions" }).click();
  await expect(page.getByText("Correct", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "My practice" }).click();
  await page.reload();
  await page.locator(".history-row").first().click();
  await expect(
    page.getByText("Difficulty scheduling early meetings", { exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "My practice" }).click();
  await page.getByRole("button", { name: "Clear practice history" }).click();
  await page.getByRole("button", { name: "Keep history" }).press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear practice history" }).click();
  await page
    .getByRole("button", { name: "Clear history", exact: true })
    .click();
  await expect(page.getByText("No attempts yet.")).toBeVisible();
});
test("dropdown inputs preserve answers and explanation", async ({ page }) => {
  await drill(page, "Fill in the Blanks \\(Dropdown\\)");
  await start(page);
  await page.getByRole("combobox", { name: "Blank 1" }).selectOption("support");
  await page
    .getByRole("combobox", { name: "Blank 2" })
    .selectOption("reliability");
  await end(page);
  await expect(
    page.getByText("support · reliability", { exact: true }),
  ).toHaveCount(1);
});
test("word bank and paragraph controls are keyboard operable", async ({
  page,
}) => {
  await drill(page, "Fill in the Blanks \\(Drag and Drop\\)");
  await start(page);
  await page.getByRole("button", { name: "interpret", exact: true }).click();
  await page.getByRole("button", { name: "Blank 1", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Blank 1: interpret" }),
  ).toBeVisible();
  await end(page);
  await page.getByRole("button", { name: "My practice" }).click();
  await drill(page, "Reorder Paragraphs");
  await start(page);
  await page
    .getByRole("button", {
      name: "A local library started a seed-sharing scheme last spring.",
    })
    .click();
  await page
    .getByRole("button", { name: "Move selected paragraph to answer" })
    .click();
  await expect(page.locator(".target")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Return paragraph 1 to source" })
    .click();
  await expect(page.locator(".target")).toHaveCount(0);
});
test("writing tools count words and ten minute timer advances forward", async ({
  page,
}) => {
  await drill(page, "Summarize Written Text");
  await start(page);
  await page
    .getByRole("textbox", { name: "Your response" })
    .fill("Community gardens need clear rules.");
  await expect(page.getByText("Total Word Count: 5")).toBeVisible();
  await page.clock.install();
  await page.clock.fastForward(600500);
  await expect(page.getByText("2 of 2", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Your response" }),
  ).toHaveValue("");
});
test("listening is single play, transcript hidden, highlight input available", async ({
  page,
}) => {
  await drill(page, "Highlight Incorrect Words");
  await start(page);
  await expect(page.getByText("Playing", { exact: true })).toBeVisible({
    timeout: 8000,
  });
  expect(await page.locator("audio").getAttribute("controls")).toBeNull();
  await page.getByRole("button", { name: "quickly.", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "quickly.", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Read the audio transcript")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeEnabled({ timeout: 35000 });
  await end(page);
  await page.getByRole("button", { name: "Prompt", exact: true }).click();
  await page.getByRole("button", { name: "Next feedback pages" }).click();
  await expect(page.getByText(/surveys the site carefully/)).toBeVisible();
});
test("microphone preflight, timed recording and persistent audio review", async ({
  page,
}) => {
  await drill(page, "Read Aloud");
  await expect(
    page.getByRole("button", { name: "Begin practice", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Test microphone" }).click();
  await expect(
    page.getByLabel("Microphone check playback", { exact: true }),
  ).toBeVisible({
    timeout: 8000,
  });
  await page.clock.install();
  await start(page);
  await page.clock.fastForward(35100);
  await expect(page.getByText("Recording", { exact: true })).toBeVisible();
  await page.clock.resume();
  await page.waitForTimeout(1200);
  await end(page);
  await expect(
    page.getByLabel("Your recording for question 1", { exact: true }),
  ).toBeVisible();
  const responsePlayer = page.getByRole("group", {
    name: "Your recording for question 1",
    exact: true,
  });
  await responsePlayer
    .getByRole("button", {
      name: "Play Your recording for question 1",
      exact: true,
    })
    .click();
  await expect
    .poll(() =>
      responsePlayer
        .locator("audio")
        .evaluate((node: HTMLAudioElement) => node.currentTime),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Speech", exact: true }).click();
  await expect(
    page.getByRole("group", {
      name: "Your recording for question 1",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Your response", exact: true })
    .click();
  await page.clock.fastForward(5000);
  await page.screenshot({
    path: "docs/evidence/routing-review-desktop.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await screenFits(page);
  await page.screenshot({
    path: "docs/evidence/routing-review-mobile.png",
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "My practice" }).click();
  await expect(page.locator(".history-row").first()).toBeVisible();
  await page.screenshot({
    path: "docs/evidence/routing-history-desktop.png",
    animations: "disabled",
  });
  await page.reload();
  await page.locator(".history-row").first().click();
  await expect(
    page.getByLabel("Your recording for question 1", { exact: true }),
  ).toBeVisible();
});
test("section mode has full scope; shared timer finishes without a backward action", async ({
  page,
}) => {
  await page.goto("/#sections");
  await page.getByRole("button", { name: "Reading", exact: true }).click();
  await page.getByRole("button", { name: "Start Reading practice" }).click();
  await expect(
    page.getByRole("heading", { name: "Reading practice", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("15 questions", { exact: true })).toBeVisible();
  await page.clock.install();
  await start(page);
  await page.clock.fastForward(1800500);
  await expect(
    page.getByRole("heading", { name: "Review", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "review questions" }),
  ).toContainText("1 / 15");
});
test("full mock has all 65 questions and advances into Reading after section timeout", async ({
  page,
}) => {
  await page.goto("/#mocks");
  await page.getByRole("button", { name: "Prepare for mock" }).click();
  await expect(
    page.getByRole("heading", { name: "Full mock 01", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("65 questions", { exact: true })).toBeVisible();
  await page
    .getByRole("checkbox", { name: "I can hear the audio clearly" })
    .check();
  await page.getByRole("button", { name: "Test microphone" }).click();
  await expect(
    page.getByLabel("Microphone check playback", { exact: true }),
  ).toBeVisible({
    timeout: 8000,
  });
  await page.clock.install();
  await page.getByRole("button", { name: "Begin mock test" }).click();
  await expect(page.locator(".exam")).toBeVisible();
  await page.clock.fastForward(4800500);
  await expect(page.getByText("36 of 65", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Blank 1" })).toBeVisible();
  await end(page);
  await expect(
    page.getByRole("navigation", { name: "review questions" }),
  ).toContainText("1 / 65");
});
test("manifest, cached media and navigation work offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  const manifest = await page.request.get("/manifest.webmanifest");
  expect((await manifest.json()).icons).toHaveLength(3);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Practice", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await drill(page, "Highlight Incorrect Words");
  await page.locator("audio").evaluate(async (el: HTMLAudioElement) => {
    await el.play();
  });
  await expect
    .poll(() =>
      page.locator("audio").evaluate((el: HTMLAudioElement) => el.currentTime),
    )
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("checkbox", { name: "I can hear the audio clearly" }),
  ).toBeVisible();
});

test("multiple choices deduct incorrect selections and explain the result", async ({
  page,
}) => {
  await drill(page, "Multiple Choice, Multiple Answers");
  await start(page);
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await end(page);
  await page.getByRole("button", { name: "Feedback", exact: true }).click();
  await expect(page.getByText(/Local item credit: 0\/2/)).toBeVisible();
});
test("listening typed gaps and dictation accept exact text after audio", async ({
  page,
}) => {
  await drill(page, "Fill in the Blanks \\(Type In\\)");
  await start(page);
  await expect(page.getByText("Playing", { exact: true })).toBeVisible({
    timeout: 8000,
  });
  await page.getByRole("textbox", { name: "Blank 1" }).fill("society");
  await page.getByRole("textbox", { name: "Blank 2" }).fill("discarded");
  await end(page);
  await expect(
    page.getByText("society · discarded", { exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "My practice" }).click();
  await drill(page, "Write from Dictation");
  await start(page);
  await expect(
    page.getByRole("textbox", { name: "Your response" }),
  ).toBeEnabled({ timeout: 6000 });
  await page
    .getByRole("textbox", { name: "Your response" })
    .fill("The results will be published in the next edition of the journal.");
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeEnabled({ timeout: 8000 });
  await end(page);
  await expect(page.getByText("Exact match", { exact: true })).toBeVisible();
});
test("blocked microphone permission has a recoverable explanation", async ({
  page,
  context,
}) => {
  await context.clearPermissions();
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Microphone permission denied", "NotAllowedError");
    };
  });
  await drill(page, "Read Aloud");
  await page.getByRole("button", { name: "Test microphone" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Microphone permission denied",
  );
  await expect(
    page.getByRole("button", { name: "Begin practice", exact: true }),
  ).toBeDisabled();
});

test("new offline pack offers an update without reloading or interrupting practice", async ({
  page,
}) => {
  const { createServer } = await import("node:http");
  const { readFile } = await import("node:fs/promises");
  const { resolve, extname, sep } = await import("node:path");
  const root = resolve("dist");
  let version = 1;
  const server = createServer(async (req, res) => {
    const path = resolve(
      root,
      "." + new URL(req.url!, "http://localhost").pathname,
    );
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const file = path === root ? resolve(root, "index.html") : path;
      let body: string | Buffer = await readFile(file);
      if (file.endsWith("/sw.js"))
        body = body
          .toString()
          .replace(
            /pte-studio-[a-f0-9]{12}/g,
            `pte-studio-browser-update-${version}`,
          );
      const mime: Record<string, string> = {
        ".js": "text/javascript",
        ".css": "text/css",
        ".html": "text/html",
        ".mp3": "audio/mpeg",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".png": "image/png",
      };
      res
        .writeHead(200, {
          "Content-Type": mime[extname(file)] || "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing local test server");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    await page.goto(origin);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    const marker = await page.evaluate(() => {
      const value = crypto.randomUUID();
      (window as Window & { testDocument?: string }).testDocument = value;
      return value;
    });
    version = 2;
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())!.update();
    });
    await expect(
      page.getByRole("button", { name: "Reload to update", exact: true }),
    ).toBeVisible({ timeout: 15000 });
    expect(
      await page.evaluate(
        () => (window as Window & { testDocument?: string }).testDocument,
      ),
    ).toBe(marker);
    await page.goto(`${origin}/#types`);
    await page.getByRole("searchbox").fill("Multiple Choice, Single Answer");
    await page
      .getByRole("button", { name: /^Multiple Choice, Single Answer/ })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Start practice", exact: true })
      .click();
    await start(page);
    await expect(
      page.getByRole("button", { name: "Reload to update" }),
    ).toHaveCount(0);
    await page
      .getByRole("radio", { name: "Difficulty scheduling early meetings" })
      .check();
    await end(page);
    await expect(
      page.getByRole("button", { name: "Reload to update", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Reload to update", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Review", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reload to update" }),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(async () =>
          (await caches.keys()).filter((k) => k.includes("browser-update-")),
        ),
      )
      .toEqual([`pte-studio:${origin}/:pte-studio-browser-update-2`]);
  } finally {
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
  }
});

async function settleView(page: Page) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement)?.blur();
    window.scrollTo(0, 0);
  });
  await page.locator(".page-enter").evaluate(async (el) => {
    await Promise.all(
      el
        .getAnimations({ subtree: true })
        .map((a) => a.finished.catch(() => {})),
    );
  });
}
async function answerReading(page: Page) {
  const exam = page.locator(".exam");
  await expect(exam).toBeVisible();
  if (await exam.getByRole("radio").count())
    await exam.getByRole("radio").first().check();
  else if (await exam.getByRole("checkbox").count())
    await exam.getByRole("checkbox").first().check();
  else if (await exam.getByRole("combobox").count())
    await exam.getByRole("combobox").first().selectOption({ index: 1 });
  else if (await exam.locator(".reorder").count()) {
    await exam.locator(".paragraph").first().click();
    await exam
      .getByRole("button", {
        name: "Move selected paragraph to answer",
        exact: true,
      })
      .click();
  } else {
    await exam.locator(".word-bank button").first().click();
    await exam.getByRole("button", { name: "Blank 1", exact: true }).click();
  }
}
test("daily quest earns real XP and badges, persists after reload and resets with history", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "0 XP, level 1. View progress" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View achievements" }).click();
  await page
    .getByRole("button", { name: "First spark, not earned. View achievement" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("0 / 1 so far");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Practice screen" }).click();
  await page
    .getByRole("button", { name: "Start daily quest", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Daily practice", exact: true }),
  ).toBeVisible();
  await start(page);
  for (let i = 0; i < 3; i++) {
    await answerReading(page);
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await expect(
    page.getByRole("region", { name: "Practice rewards" }),
  ).toContainText("+60");
  await expect(
    page.getByRole("heading", {
      name: "Daily practice complete!",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "60 XP, level 1. View progress" }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/evidence/game-reward.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Practice", exact: true })
    .click();
  await expect(page.getByText("GOAL COMPLETE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View achievements" }).click();
  await expect(
    page.getByRole("button", {
      name: "First spark, earned. View achievement",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Daily finisher, earned. View achievement",
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "60 XP, level 1. View progress" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View level and streak" }).click();
  await settleView(page);
  await page.screenshot({
    path: "docs/evidence/game-progress.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "My practice", exact: true })
    .click();
  await page.locator(".history-row").first().click();
  await expect(
    page.getByRole("region", { name: "Practice rewards" }),
  ).toContainText("+60");
  await expect(page.locator(".confetti")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "60 XP, level 1. View progress" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My practice", exact: true }).click();
  await page.getByRole("button", { name: "Clear practice history" }).click();
  await expect(page.getByRole("dialog")).toContainText("XP, streaks, badges");
  await page
    .getByRole("button", { name: "Clear history", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "0 XP, level 1. View progress" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "0 XP, level 1. View progress" }),
  ).toBeVisible();
});
test("an empty quest earns no XP; a partial quest resumes remaining questions; reduced motion suppresses celebrations", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start daily quest", exact: true })
    .click();
  await start(page);
  await end(page);
  await expect(
    page.getByRole("region", { name: "Practice rewards" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "0 XP, level 1. View progress" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "0 XP, level 1. View progress" })
    .click();
  await page.getByRole("button", { name: "Practice screen" }).click();
  await page
    .getByRole("button", { name: "Start daily quest", exact: true })
    .click();
  await start(page);
  await answerReading(page);
  await end(page);
  await expect(
    page.getByRole("region", { name: "Practice rewards" }),
  ).toContainText("+10");
  await expect(page.locator(".confetti")).toBeHidden();
  await page
    .getByRole("button", { name: "10 XP, level 1. View progress" })
    .click();
  await page.getByRole("button", { name: "Practice screen" }).click();
  await expect(
    page.getByRole("region", { name: "Daily practice" }),
  ).toContainText("1");
  await page
    .getByRole("button", { name: "Continue daily quest", exact: true })
    .click();
  await expect(page.getByText("2 questions", { exact: true })).toBeVisible();
});

test("real routes restore history sessions, missing records and screen navigation", async ({
  page,
}) => {
  await page.goto("/#history");
  await expect(page).toHaveURL(/\/history$/);
  await expect(
    page.getByRole("navigation", { name: "attempt pages", exact: true }),
  ).toHaveCount(0);
  await drill(page, "Multiple Choice, Single Answer");
  await expect(page).toHaveURL(/\/practice\/type\/reading-single$/);
  await start(page);
  await expect(page).toHaveURL(/\/practice\/type\/reading-single\/run$/);
  await page
    .getByRole("radio", { name: "Difficulty scheduling early meetings" })
    .check();
  await end(page);
  const sessionURL = page.url();
  expect(sessionURL).toMatch(/\/history\/[^/]+$/);
  await expect(page.locator(".review-heading")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "feedback pages", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("Difficulty scheduling early meetings", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My practice", exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  const card = page.locator(".history-row").first();
  expect((await card.boundingBox())!.height).toBeLessThan(180);
  await expect(card).toHaveAttribute("href", new URL(sessionURL).pathname);
  await card.click();
  await expect(page).toHaveURL(sessionURL);
  await page.goBack();
  await expect(page).toHaveURL(/\/history$/);
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Review", exact: true }),
  ).toBeVisible();
  await page.goto("/history/not-a-saved-session");
  await expect(
    page.getByText("This session is no longer available on this device."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to history" }).click();
  await expect(page.locator(".history-row")).toHaveCount(1);
  await page.goto("/types/read-aloud");
  await expect(
    page.getByRole("heading", { name: "Read Aloud", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Start practice", exact: true }),
  ).toBeVisible();
  await page.goto("/guide");
  await page.getByRole("button", { name: "Start with the basics" }).click();
  await expect(page).toHaveURL(/\/guide\/[^/]+$/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Start with the basics" }),
  ).toBeVisible();
  await page.goto("/sections/reading");
  await expect(
    page.getByRole("button", { name: "Reading", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Listening", exact: true }).click();
  await expect(page).toHaveURL(/\/sections\/listening$/);
  await page.goto("/progress");
  await expect(
    page.getByRole("region", { name: "Practice level" }),
  ).toBeVisible();
  await page.goto("/achievements");
  await expect(
    page.getByRole("heading", { name: "Your achievements.", exact: true }),
  ).toBeVisible();
  await page.goto("/missing-page");
  await expect(page.getByText("This page is unavailable.")).toBeVisible();
});

test("practice route reload and browser back return to preflight without restarting a timer", async ({
  page,
}) => {
  await page.goto("/practice/type/reading-single/run");
  await expect(page).toHaveURL(/\/practice\/type\/reading-single$/);
  await expect(
    page.getByRole("button", { name: "Begin practice", exact: true }),
  ).toBeVisible();
  await start(page);
  await expect(page).toHaveURL(/\/run$/);
  await page.goBack();
  await expect(
    page.getByRole("button", { name: "Begin practice", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/practice\/type\/reading-single$/);
  await start(page);
  await expect(page.getByRole("radio").first()).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/practice\/type\/reading-single$/);
  await expect(
    page.getByRole("button", { name: "Begin practice", exact: true }),
  ).toBeVisible();
  await page.goto("/practice/type/unknown");
  await expect(page.getByText("This page is unavailable.")).toBeVisible();
});

test.describe("shared playback", () => {
  test.use({ serviceWorkers: "block" });
  test("shared audio player supports playback, keyboard seeking, failure recovery and navigation cleanup", async ({
    page,
  }) => {
    await page.goto("/practice/type/repeat-sentence");
    const player = page.getByRole("group", {
      name: "Headphone check",
      exact: true,
    });
    const audio = player.locator("audio");
    await expect(audio).not.toHaveAttribute("controls");
    await player
      .getByRole("button", { name: "Play Headphone check", exact: true })
      .click();
    await expect
      .poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
      .toBeGreaterThan(0);
    await player
      .getByRole("button", { name: "Pause Headphone check", exact: true })
      .click();
    expect(await audio.evaluate((node: HTMLAudioElement) => node.paused)).toBe(
      true,
    );
    const seek = player.getByRole("slider", {
      name: "Seek Headphone check",
      exact: true,
    });
    await seek.focus();
    await seek.press("ArrowRight");
    expect(
      await audio.evaluate((node: HTMLAudioElement) => node.currentTime),
    ).toBeGreaterThan(0);
    await player
      .getByRole("button", { name: "Play Headphone check", exact: true })
      .click();
    // Retain the detached media element to prove navigation stops actual playback.
    const previous = await audio.elementHandle();
    await page
      .getByRole("button", { name: "Back to practice", exact: true })
      .click();
    await expect(player).toHaveCount(0);
    await expect
      .poll(() => previous!.evaluate((node: HTMLAudioElement) => node.paused))
      .toBe(true);
    await page.route("**/audio/repeat-sentence-01.mp3", (route) =>
      route.abort(),
    );
    await page.goto("/practice/type/repeat-sentence");
    await expect(
      page.getByRole("button", { name: "Retry Headphone check", exact: true }),
    ).toBeVisible();
    await page.unroute("**/audio/repeat-sentence-01.mp3");
    await page
      .getByRole("button", { name: "Retry Headphone check", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Pause Headphone check", exact: true }),
    ).toBeVisible();
  });
});

test("simplified workspace fits desktop and mobile, with compact history and shared media", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 360, height: 640 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Start daily quest", exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".quest-steps, .beginner-entry, .review-heading"),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Install app" })).toHaveCount(
      0,
    );
    await expect(page.getByLabel("Offline ready", { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByText(/Three questions\.|One daily win\.|A small reading round/),
    ).toHaveCount(0);
    if (viewport.width < 768) {
      const nav = page.getByRole("navigation", {
        name: "Mobile navigation",
        exact: true,
      });
      await expect(nav.getByRole("link")).toHaveCount(3);
      for (const name of ["Practice", "Learn", "History"])
        await expect(
          nav.getByRole("link", { name, exact: true }),
        ).toBeVisible();
    }
    await screenFits(page);
    await page.screenshot({
      path: `test-results/ui-home-${viewport.width}.png`,
      animations: "disabled",
    });
    await page.goto("/history");
    await expect(
      page.getByRole("navigation", { name: "attempt pages", exact: true }),
    ).toHaveCount(0);
    await screenFits(page);
    await page.goto("/practice/type/repeat-sentence");
    await expect(
      page.getByRole("group", { name: "Headphone check", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(viewport.width);
  }
});

test("section filters remain independent across routed question guides", async ({
  page,
}) => {
  await page.goto("/types");
  const filters = page.getByRole("group", {
    name: "Filter by section",
    exact: true,
  });
  const reading = filters.getByRole("button", {
    name: "Filter: Reading",
    exact: true,
  });
  const listening = filters.getByRole("button", {
    name: "Filter: Listening",
    exact: true,
  });
  const speaking = filters.getByRole("button", {
    name: "Filter: Speaking & Writing",
    exact: true,
  });
  for (const filter of [reading, listening, speaking])
    await expect(filter).toHaveAttribute("aria-pressed", "true");
  await reading.click();
  await expect(reading).toHaveAttribute("aria-pressed", "false");
  await expect(listening).toHaveAttribute("aria-pressed", "true");
  await expect(speaking).toHaveAttribute("aria-pressed", "true");
  await listening.click();
  await page.getByRole("searchbox").fill("Read Aloud");
  await expect(page.locator(".type-row")).toHaveCount(1);
  await expect(
    page.getByRole("navigation", { name: "question type pages", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^Read Aloud/ }).click();
  await expect(page).toHaveURL(/\/types\/read-aloud$/);
  await page
    .getByRole("button", { name: "All question types", exact: true })
    .click();
  await expect(reading).toHaveAttribute("aria-pressed", "false");
  await expect(listening).toHaveAttribute("aria-pressed", "false");
  await expect(speaking).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("searchbox")).toHaveValue("Read Aloud");
  await speaking.click();
  await expect(page.getByText("No question types found.")).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  for (const filter of [reading, listening, speaking])
    await expect(filter).toHaveAttribute("aria-pressed", "true");
});

test("populated compact history pages fit without overlapping pagination", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    const entries = Array.from({ length: 10 }, (_, index) => ({
      id: `history-layout-${index}`,
      label:
        index % 2
          ? "Multiple Choice, Multiple Answers"
          : "Speaking & Writing practice",
      date: "2026-10-16T01:00:00.000Z",
      questionIds: ["read-aloud-01"],
      answers: {},
      finished: true,
    }));
    localStorage.setItem("pte-studio-history-v1", JSON.stringify(entries));
  });
  for (const size of [
    { width: 390, height: 844 },
    { width: 390, height: 900 },
    { width: 1440, height: 900 },
    { width: 900, height: 900 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/history");
    await expect(page.locator(".history-row").first()).toBeVisible();
    const seen = new Set<string>();
    do {
      await expect
        .poll(() =>
          page.locator(".history-list .cards-list-grid").evaluate((panel) => {
            const host = panel.parentElement!;
            const pager = host.querySelector(":scope > .page-controls");
            const limit = Math.min(
              host.getBoundingClientRect().bottom,
              pager?.getBoundingClientRect().top ?? Infinity,
            );
            return Array.from(panel.children).every(
              (card) => card.getBoundingClientRect().bottom <= limit + 1,
            );
          }),
        )
        .toBe(true);
      for (const id of await page
        .locator(".history-row")
        .evaluateAll((cards) =>
          cards.map((card) => card.getAttribute("href")!),
        ))
        seen.add(id);
      await screenFits(page);
      const next = page.getByRole("button", {
        name: "Next attempt pages",
        exact: true,
      });
      if (!(await next.count()) || (await next.isDisabled())) break;
      await next.click();
    } while (true);
    expect(seen.size).toBe(10);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/history");
  await page.addStyleTag({ content: ".history-row { font-size: 28px; }" });
  await expect
    .poll(() =>
      page.locator(".history-list .cards-list-grid").evaluate((panel) => {
        const pager = panel.parentElement!.querySelector(
          ":scope > .page-controls",
        );
        const limit = pager?.getBoundingClientRect().top ?? Infinity;
        return Array.from(panel.children).every(
          (card) => card.getBoundingClientRect().bottom <= limit + 1,
        );
      }),
    )
    .toBe(true);
  await page.screenshot({
    path: "docs/evidence/routing-history-populated-mobile.png",
    animations: "disabled",
  });
});
