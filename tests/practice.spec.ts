import { test, expect, type Page } from "@playwright/test";
async function drill(page: Page, name: string) {
  await page.goto("/#types");
  await page
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Start practice", exact: true })
    .click();
}
async function start(page: Page) {
  const checkbox = page.getByRole("checkbox", {
    name: "I can hear the audio clearly",
  });
  if (await checkbox.count()) await checkbox.check();
  await page
    .getByRole("button", { name: "Begin practice", exact: true })
    .click();
}
async function end(page: Page) {
  await page.getByRole("button", { name: "End practice", exact: true }).click();
  await page.getByRole("button", { name: "End & review", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review", exact: true }),
  ).toBeVisible();
}
test("beginner navigation, all guides, mobile layout and original branding", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Practice", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main navigation", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeHidden();
  await expect(page.getByText(/PTE Academic tests speaking/)).toBeHidden();
  await settleView(page);
  await page.screenshot({
    path: "docs/evidence/overview-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Install app" }).hover();
  await expect(page.locator('[data-slot="tooltip-content"]')).toContainText(
    "Install app",
  );
  await page.getByRole("button", { name: "Install app" }).click();
  await expect(
    page.getByText(/Use your browser’s Install option/),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "New to PTE Academic?" }).click();
  await page.getByRole("button", { name: "Learn the basics" }).click();
  await expect(
    page.getByRole("heading", { name: "Start with the basics" }),
  ).toBeVisible();
  await page.goto("/#types");
  await expect(page.locator(".type-row")).toHaveCount(22);
  await page.getByRole("searchbox").fill("nonsense");
  await expect(page.getByText("No question types found")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("button", { name: /^Read Aloud/ }).click();
  await expect(page.getByText(/Read the passage aloud clearly/)).toBeHidden();
  await page.getByRole("button", { name: "Instructions", exact: true }).click();
  await expect(page.locator('[data-slot="accordion-content"]')).toBeVisible();
  expect(
    await page
      .locator('[data-slot="accordion-content"]')
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("accordion-down");
  await page
    .getByRole("button", { name: "Strategy & tips", exact: true })
    .click();
  await expect(page.locator('[data-slot="accordion-content"]')).toHaveCount(2);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Practice", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("navigation", { name: "Main navigation", exact: true }),
  ).toBeHidden();
  const mobile = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(mobile).toBeVisible();
  await expect(mobile.getByRole("link")).toHaveCount(6);
  await mobile.getByRole("link", { name: "Section practice" }).click();
  await expect(
    page.getByRole("heading", { name: "Sections", exact: true }),
  ).toBeVisible();
  await mobile.getByRole("link", { name: "Practice", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "New to PTE Academic?" }).click();
  await expect(page.getByText(/PTE Academic tests speaking/)).toBeVisible();
  expect(
    await page
      .locator(".page-enter")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.getByRole("button", { name: "New to PTE Academic?" }).click();
  await settleView(page);
  await page.screenshot({
    path: "docs/evidence/overview-mobile.png",
    fullPage: false,
    animations: "disabled",
  });
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
  await expect(page.getByText("Correct", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "My practice" }).click();
  await page.reload();
  await page.locator(".history-list>button").first().click();
  await page
    .locator('.review-item [data-slot="accordion-trigger"]')
    .first()
    .click();
  await expect(
    page.getByText("Difficulty scheduling early meetings", { exact: true }),
  ).toHaveCount(2);
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
  await page
    .locator('.review-item [data-slot="accordion-trigger"]')
    .first()
    .click();
  await expect(
    page.getByText("support · reliability", { exact: true }),
  ).toHaveCount(2);
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
  await page
    .locator('.review-item [data-slot="accordion-trigger"]')
    .first()
    .click();
  await page
    .locator(".review-item")
    .first()
    .getByText("Read the audio transcript")
    .click();
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
  await expect(page.getByLabel("Microphone check playback")).toBeVisible({
    timeout: 8000,
  });
  await page.clock.install();
  await start(page);
  await page.clock.fastForward(35100);
  await expect(page.getByText("Recording", { exact: true })).toBeVisible();
  await page.clock.resume();
  await page.waitForTimeout(1200);
  await end(page);
  await page
    .locator('.review-item [data-slot="accordion-trigger"]')
    .first()
    .click();
  await expect(page.getByLabel("Your recording for question 1")).toBeVisible();
  await page.getByRole("button", { name: "My practice" }).click();
  await page.reload();
  await page.locator(".history-list>button").first().click();
  await page
    .locator('.review-item [data-slot="accordion-trigger"]')
    .first()
    .click();
  await expect(page.getByLabel("Your recording for question 1")).toBeVisible();
});
test("section mode has full scope; shared timer finishes without a backward action", async ({
  page,
}) => {
  await page.goto("/#sections");
  await page
    .locator(".section-card")
    .nth(1)
    .getByRole("button", { name: "Start Reading practice" })
    .click();
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
  await expect(page.locator(".review-item")).toHaveCount(15);
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
  await expect(page.getByLabel("Microphone check playback")).toBeVisible({
    timeout: 8000,
  });
  await page.clock.install();
  await page.getByRole("button", { name: "Begin mock test" }).click();
  await page.clock.fastForward(4800500);
  await expect(page.getByText("36 of 65", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Blank 1" })).toBeVisible();
  await end(page);
  await expect(page.locator(".review-item")).toHaveCount(65);
});
test("manifest, cached media and navigation work offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("status", { name: "Offline ready", exact: true }),
  ).toBeVisible({
    timeout: 15000,
  });
  const manifest = await page.request.get("/manifest.webmanifest");
  expect((await manifest.json()).icons).toHaveLength(3);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Practice", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Offline", exact: true }),
  ).toBeVisible();
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
  await page
    .locator('.review-item [data-slot="accordion-trigger"]')
    .first()
    .click();
  await expect(
    page
      .locator(".review-item")
      .first()
      .getByText(/Local item credit: 0\/2/),
  ).toBeVisible();
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
  await page
    .locator('.review-item [data-slot="accordion-trigger"]')
    .first()
    .click();
  await expect(
    page.getByText("society · discarded", { exact: true }),
  ).toHaveCount(2);
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
    await expect(
      page.getByRole("status", { name: "Offline ready", exact: true }),
    ).toBeVisible({ timeout: 15000 });
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
      page.getByRole("heading", { name: "Question types", exact: true }),
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
  await page
    .getByRole("button", { name: "First spark, locked. View achievement" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("0 / 1 so far");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Start quest", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Daily quest", exact: true }),
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
    page.getByRole("heading", { name: "Daily quest complete!", exact: true }),
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
  await expect(
    page.getByRole("button", {
      name: "First spark, unlocked. View achievement",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Daily finisher, unlocked. View achievement",
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "60 XP, level 1. View progress" }),
  ).toBeVisible();
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
  await page.locator(".history-list>button").first().click();
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
  await page.getByRole("button", { name: "Start quest", exact: true }).click();
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
  await page.getByRole("button", { name: "Start quest", exact: true }).click();
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
  await expect(
    page.getByLabel("1 of 3 daily questions answered"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Continue quest", exact: true })
    .click();
  await expect(page.getByText("2 questions", { exact: true })).toBeVisible();
});
