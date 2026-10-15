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
    page.getByRole("heading", { name: "A little wiser than before." }),
  ).toBeVisible();
}
test("beginner navigation, all guides, mobile layout and original branding", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Your next chapter/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/evidence/overview-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Meet the test" }).click();
  await expect(
    page.getByRole("heading", { name: "Start with the basics" }),
  ).toBeVisible();
  await page.goto("/#types");
  await expect(page.locator(".type-row")).toHaveCount(22);
  await page.getByRole("searchbox").fill("nonsense");
  await expect(page.getByText("No question types found")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Your next chapter/ }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "docs/evidence/overview-mobile.png",
    fullPage: true,
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
  await page.getByRole("button", { name: "← My practice" }).click();
  await page.reload();
  await page.locator(".history-list>button").first().click();
  await page.locator(".review-item summary").first().click();
  await expect(
    page.getByText("Difficulty scheduling early meetings", { exact: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "← My practice" }).click();
  await page.getByRole("button", { name: "Clear practice history" }).click();
  await page.getByRole("button", { name: "Keep history" }).press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear practice history" }).click();
  await page
    .getByRole("button", { name: "Clear history", exact: true })
    .click();
  await expect(
    page.getByText("Your first attempt starts a habit."),
  ).toBeVisible();
});
test("dropdown inputs preserve answers and explanation", async ({ page }) => {
  await drill(page, "Fill in the Blanks \\(Dropdown\\)");
  await start(page);
  await page.getByRole("combobox", { name: "Blank 1" }).selectOption("support");
  await page
    .getByRole("combobox", { name: "Blank 2" })
    .selectOption("reliability");
  await end(page);
  await page.locator(".review-item summary").first().click();
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
  await page.getByRole("button", { name: "← My practice" }).click();
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
  await page.locator(".review-item summary").first().click();
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
  await page.locator(".review-item summary").first().click();
  await expect(page.getByLabel("Your recording for question 1")).toBeVisible();
  await page.getByRole("button", { name: "← My practice" }).click();
  await page.reload();
  await page.locator(".history-list>button").first().click();
  await page.locator(".review-item summary").first().click();
  await expect(page.getByLabel("Your recording for question 1")).toBeVisible();
});
test("section mode has full scope; shared timer finishes without a backward action", async ({
  page,
}) => {
  await page.goto("/#sections");
  await page
    .locator(".section-card")
    .nth(1)
    .getByRole("button", { name: "Start section" })
    .click();
  await expect(page.getByText("Reading practice · 15 questions")).toBeVisible();
  await page.clock.install();
  await start(page);
  await page.clock.fastForward(1800500);
  await expect(
    page.getByRole("heading", { name: "A little wiser than before." }),
  ).toBeVisible();
  await expect(page.locator(".review-item")).toHaveCount(15);
});
test("full mock has all 65 questions and advances into Reading after section timeout", async ({
  page,
}) => {
  await page.goto("/#mocks");
  await page.getByRole("button", { name: "Prepare for mock" }).click();
  await expect(page.getByText("Full mock 01 · 65 questions")).toBeVisible();
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
  await expect(page.getByText("Offline ready", { exact: true })).toBeVisible({
    timeout: 15000,
  });
  const manifest = await page.request.get("/manifest.webmanifest");
  expect((await manifest.json()).icons).toHaveLength(3);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Your next chapter/ }),
  ).toBeVisible();
  await expect(page.getByText("Offline", { exact: true })).toBeVisible();
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
  await page.locator(".review-item summary").first().click();
  await expect(page.locator(".review-item").first().getByText(/Local item credit: 0\/2/)).toBeVisible();
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
  await page.locator(".review-item summary").first().click();
  await expect(
    page.getByText("society · discarded", { exact: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "← My practice" }).click();
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
