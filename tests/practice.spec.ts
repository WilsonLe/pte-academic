import { test, expect, type Page } from "@playwright/test";
import guideData from "../content/guides.json" with { type: "json" };
import questions from "../content/questions.json" with { type: "json" };
import sections from "../content/sections.json" with { type: "json" };
import type { Guide } from "../src/content";
async function openAchievements(page: Page) {
  const mobile = page.viewportSize()!.width < 768;
  await page
    .getByRole("navigation", {
      name: mobile ? "Mobile navigation" : "Main navigation",
      exact: true,
    })
    .getByRole("link", {
      name: mobile ? "History" : "My practice",
      exact: true,
    })
    .click();
  await page.getByRole("link", { name: "Achievements", exact: true }).click();
  await expect(page).toHaveURL(/\/achievements$/);
  await expect(
    page
      .getByRole("navigation", {
        name: mobile ? "Mobile navigation" : "Main navigation",
        exact: true,
      })
      .getByRole("link", {
        name: mobile ? "History" : "My practice",
        exact: true,
      }),
  ).toHaveAttribute("aria-current", "page");
}
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
            ((!node.closest(".cards-list-scroll") &&
              (r.top < parent.top - 1 || r.bottom > parent.bottom + 1)) ||
              r.left < parent.left - 1 ||
              r.right > parent.right + 1)
          );
        })
        .map((n) => n.textContent || n.getAttribute("aria-label")),
    );
  expect(bad).toEqual([]);
}
test("fixed viewport blocks app zoom and document scrolling without blocking input", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 360, height: 400 },
    { width: 320, height: 451 },
    { width: 320, height: 560 },
  ]) {
    await page.setViewportSize(size);
    for (const route of ["/", "/types", "/guide", "/history"]) {
      await page.goto(route);
      await expect(page.locator("main")).toBeVisible();
      expect(
        await page.locator('meta[name="viewport"]').getAttribute("content"),
      ).toContain("maximum-scale=1.0,user-scalable=no");
      const result = await page.evaluate(() => {
        window.scrollTo(500, 500);
        document.body.scrollTo(500, 500);
        return {
          x: scrollX,
          y: scrollY,
          bodyX: document.body.scrollLeft,
          bodyY: document.body.scrollTop,
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          touch: getComputedStyle(document.body).touchAction,
        };
      });
      expect(result).toEqual({
        x: 0,
        y: 0,
        bodyX: 0,
        bodyY: 0,
        width: size.width,
        height: size.height,
        touch: "pan-x pan-y",
      });
      await page.mouse.move(size.width - 10, 80);
      await page.mouse.wheel(0, 800);
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    }
  }
  await page.goto("/types");
  const search = page.getByRole("searchbox");
  await search.fill("Read Aloud");
  await expect(search).toHaveValue("Read Aloud");
  expect(
    await search.evaluate((node) => getComputedStyle(node).touchAction),
  ).toBe("pan-x pan-y");
  const cancelled = await search.evaluate((node) => {
    const events = [
      ...["+", "=", "-", "0"].flatMap((key) => [
        new KeyboardEvent("keydown", {
          key,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
        new KeyboardEvent("keydown", {
          key,
          metaKey: true,
          bubbles: true,
          cancelable: true,
        }),
      ]),
      new WheelEvent("wheel", {
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
      new WheelEvent("wheel", {
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
      new Event("gesturestart", { bubbles: true, cancelable: true }),
      new Event("gesturechange", { bubbles: true, cancelable: true }),
    ];
    return events.map((event) => !node.dispatchEvent(event));
  });
  expect(cancelled.every(Boolean)).toBe(true);
  expect(
    await search.evaluate((node) =>
      [
        new KeyboardEvent("keydown", {
          key: "-",
          bubbles: true,
          cancelable: true,
        }),
        new KeyboardEvent("keydown", {
          key: "a",
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
        new WheelEvent("wheel", { bubbles: true, cancelable: true }),
      ].every((event) => node.dispatchEvent(event)),
    ),
  ).toBe(true);
  await page.screenshot({ path: "test-results/viewport-short.png" });
});

test("fixed viewport keeps preparation and timed response controls reachable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const size of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
    { width: 360, height: 400 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/practice/type/write-essay");
    await start(page);
    await expect(page.locator(".exam-clock")).toContainText(
      /Section time remaining (80:00|79:\d{2})/,
    );
    await expect(page.locator(".item-clock")).toContainText(
      /Question time remaining: (20:00|19:\d{2})/,
    );
    const response = page.getByRole("textbox", {
      name: "Your response",
      exact: true,
    });
    await response.fill("A short response remains editable.");
    await expect(response).toHaveValue("A short response remains editable.");
    const footer = await page.locator(".exam-footer").boundingBox();
    expect(footer!.y).toBeGreaterThanOrEqual(0);
    expect(footer!.y + footer!.height).toBeLessThanOrEqual(size.height);
    await page.evaluate(() => window.scrollTo(500, 500));
    expect(
      await page.evaluate(() => ({
        x: scrollX,
        y: scrollY,
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      })),
    ).toEqual({ x: 0, y: 0, width: size.width, height: size.height });
    await page.screenshot({
      path: `test-results/viewport-exam-${size.width}.png`,
    });
    await end(page);
  }
});

test("shared cards list fits responsive panels and exposes every question type", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const sectionNames: Record<string, string> = {
    speaking: "Speaking & Writing",
    reading: "Reading",
    listening: "Listening",
  };
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
    // Reload restores the previous viewport's last page; inventory from the start.
    const previous = page.getByRole("button", {
      name: "Previous question type pages",
    });
    while (await previous.isEnabled()) await previous.click();
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
      for (const card of await page.locator(".type-row").all())
        await expect(card).toHaveAccessibleName(
          new RegExp(
            ` ${sectionNames[(await card.getAttribute("data-track"))!]}(?: |$)`,
          ),
        );
      const next = page.getByRole("button", {
        name: "Next question type pages",
      });
      if (await next.isDisabled()) break;
      await next.click();
    }
    expect(titles.size).toBe(22);
  }
});

test("catalogue names distinguish Reading and Listening choices before keyboard navigation", async ({
  page,
  context,
}) => {
  await context.route("**/models/**", (route) => route.abort());
  await page.goto("/types");
  await page.getByRole("searchbox").fill("Multiple");
  for (const title of [
    "Multiple Choice, Multiple Answers",
    "Multiple Choice, Single Answer",
  ]) {
    for (const section of ["Reading", "Listening"])
      await expect(
        page.getByRole("button", {
          name: `${title} ${section} 2`,
          exact: true,
        }),
      ).toHaveCount(1);
  }
  for (const [section, route] of [
    ["Reading", "reading-multiple"],
    ["Listening", "listening-multiple"],
  ]) {
    const choice = page.getByRole("button", {
      name: `Multiple Choice, Multiple Answers ${section} 2`,
      exact: true,
    });
    await choice.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/types/${route}$`));
    await page
      .getByRole("button", { name: "All question types", exact: true })
      .click();
    await expect(page.getByRole("searchbox")).toHaveValue("Multiple");
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
  await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(
    0,
  );
  await page.getByRole("searchbox").fill("");
  await expect(
    page.getByRole("button", { name: "Previous question type pages" }),
  ).toBeDisabled();
  await page.goto("/#history");
  await expect(page.getByText("No attempts yet.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Clear.*history/i }),
  ).toHaveCount(0);
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
  await openAchievements(page);
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

test("Learn study step survives reload and practice return", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/guide/first-week");
  const topic = page.getByRole("combobox", { name: "Learning topic" });
  await topic.selectOption({ label: "Days 5–6: connect a section" });
  await page.reload();
  await expect(topic).toHaveValue("2");
  await expect(page).toHaveURL(/\/guide\/first-week\?section=3$/);
  await expect(
    page.getByRole("region", { name: "Learning article" }),
  ).toContainText("Try a complete section with the timer running.");
  await page.getByRole("button", { name: "Practise", exact: true }).click();
  await expect(page).toHaveURL(/\/types$/);
  await page.goBack();
  await expect(topic).toHaveValue("2");
  await page.goForward();
  await expect(page).toHaveURL(/\/types$/);
  await page.goBack();
  await topic.selectOption({ label: "Overview" });
  await expect(page).toHaveURL(/\/guide\/first-week$/);
  await page.reload();
  await expect(topic).toHaveValue("-1");
  await page.goto("/guide");
  await page
    .getByRole("button", { name: "Your first week of practice", exact: true })
    .click();
  await topic.selectOption("2");
  await topic.selectOption("3");
  await page.goBack();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(
    page.getByRole("heading", { name: "About PTE.", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(topic).toHaveValue("3");
});

test("Learn study-step deep links cover every category and reject invalid selections", async ({
  page,
}) => {
  const { readFile } = await import("node:fs/promises");
  const articles = JSON.parse(
    await readFile(new URL("../content/learn.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    title: string;
    intro: string;
    blocks: { text: string }[];
  }[];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const topic = page.getByRole("combobox", { name: "Learning topic" });
  const copy = page.getByRole("region", { name: "Learning article" });
  for (const article of articles) {
    await page.goto(`/guide/${article.id}?section=${article.blocks.length}`);
    await expect(topic).toHaveValue(String(article.blocks.length - 1));
    await expect(copy).toHaveText(article.blocks.at(-1)!.text);
    await page.reload();
    await expect(topic).toHaveValue(String(article.blocks.length - 1));
    await expect(copy).toHaveText(article.blocks.at(-1)!.text);
    await page.getByRole("button", { name: "All learning topics" }).click();
    await expect(page).toHaveURL(/\/guide$/);
    await page
      .getByRole("button", { name: article.title, exact: true })
      .click();
    await expect(topic).toHaveValue("-1");
    await expect(copy).toHaveText(article.intro);
  }
  const first = articles[0];
  for (const section of [
    "0",
    "-1",
    "1.5",
    "text",
    "999",
    "1e100",
    "%5B1%2C2%5D",
  ]) {
    await page.goto(`/guide/${first.id}?section=${section}`);
    await expect(topic).toHaveValue("-1");
    await expect(copy).toHaveText(first.intro);
    await topic.selectOption("0");
    await expect(copy).toHaveText(first.blocks[0].text);
    await expect(page).toHaveURL(new RegExp(`/guide/${first.id}\\?section=1$`));
  }
  expect(errors).toEqual([]);
});

test("Learn scrolls all topics and article text while History keeps paging", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto("/#guide");
  const { readFile } = await import("node:fs/promises");
  const sourceTopics = JSON.parse(
    await readFile(new URL("../content/learn.json", import.meta.url), "utf8"),
  ) as {
    id: string;
    title: string;
    intro: string;
    blocks: { title: string; text: string }[];
  }[];
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/guide");
    await expect(
      page.getByRole("heading", { name: "About PTE.", exact: true }),
    ).toBeVisible();
    const topics = page.getByRole("region", {
      name: "learning topics",
      exact: true,
    });
    await expect(topics.getByRole("button")).toHaveCount(sourceTopics.length);
    await expect(page.locator(".page-controls")).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath(`learn-topics-${viewport.width}.png`),
    });
    if (viewport.width === 360) {
      await topics.focus();
      await topics.press("End");
      await expect
        .poll(() => topics.evaluate((node) => node.scrollTop))
        .toBeGreaterThan(0);
      await expect(topics.getByRole("button").last()).toBeInViewport();
    }
    await topics.getByRole("button").last().click();
    await expect(
      page.getByRole("heading", {
        name: sourceTopics.at(-1)!.title,
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "All learning topics" }).click();
    await expect(topics).toBeVisible();
    for (const article of sourceTopics) {
      await topics
        .getByRole("button", { name: article.title, exact: true })
        .click();
      const copy = page.getByRole("region", {
        name: "Learning article",
        exact: true,
      });
      await expect(copy).toHaveText(article.intro);
      for (let i = 0; i < article.blocks.length; i++) {
        await page
          .getByRole("combobox", { name: "Learning topic" })
          .selectOption(String(i));
        await expect(copy).toHaveText(article.blocks[i].text);
        expect(new URL(page.url()).searchParams.get("section")).toBe(
          String(i + 1),
        );
        await expect(page.locator(".page-controls")).toHaveCount(0);
      }
      await page.getByRole("button", { name: "All learning topics" }).click();
    }
    await screenFits(page);
  }
  // Enlarged text remains complete and can be scrolled by keyboard.
  await page.setViewportSize({ width: 360, height: 640 });
  await page.goto(`/guide/${sourceTopics[0].id}`);
  await page.addStyleTag({
    content: ".reading-copy { font-size: 32px; line-height: 1.7; }",
  });
  const copy = page.getByRole("region", {
    name: "Learning article",
    exact: true,
  });
  await copy.focus();
  await copy.press("End");
  await expect
    .poll(() => copy.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(0);
  await expect(copy).toHaveText(sourceTopics[0].intro);
  await expect(page.locator(".page-controls")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("learn-article-enlarged-mobile.png"),
  });

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
            .locator(".cards-list:not(.cards-list-scroll)")
            .evaluateAll((nodes) =>
              nodes.every((node) => node.scrollHeight <= node.clientHeight + 1),
            ),
        )
        .toBe(true);
    }
    await page.goto("/#home");
    await page
      .getByRole("button", { name: /XP, level \d+\. View progress/ })
      .click();
    await expect(
      page.getByRole("region", { name: "Practice level" }),
    ).toBeVisible();
    await screenFits(page);
    await openAchievements(page);
    await expect(
      page.getByRole("button", {
        name: "First spark, not earned. View achievement",
      }),
    ).toBeVisible();
    await screenFits(page);
    await page
      .getByRole("link", { name: "PTE Studio home", exact: true })
      .click();
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
  // Background speech preparation no longer changes the catalogue panel size.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
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
  await expect(page.getByRole("button", { name: "Clear filters" })).toHaveCount(
    0,
  );
  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: /^Read Aloud/ }).click();
  await expect(page.getByText(/Read the text silently/)).toBeVisible();
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
  await page
    .getByRole("button", { name: "Finish practice", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /Option B: Selected · Correct/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next review questions" }).click();
  await expect(
    page.getByRole("button", { name: /Selected · Correct/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My practice" }).click();
  await page.reload();
  await page.locator(".history-row").first().click();
  await expect(
    page.getByText("Difficulty scheduling early meetings", { exact: true }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "My practice" }).click();
  await expect(
    page.getByRole("heading", { name: "Sessions.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Clear.*history/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".history-row")).toHaveCount(1);
});
test("dropdown inputs preserve answers and explanation", async ({ page }) => {
  await drill(page, "Fill in the Blanks \\(Dropdown\\)");
  await start(page);
  await page.getByRole("combobox", { name: "Blank 1" }).selectOption("support");
  await page
    .getByRole("combobox", { name: "Blank 2" })
    .selectOption("reliability");
  await end(page);
  for (const [index, word] of ["support", "reliability"].entries()) {
    const comparison = page.getByRole("button", {
      name: `Gap ${index + 1}: Correct. Explain`,
      exact: true,
    });
    await expect(comparison).toContainText(word);
    await comparison.click();
    await expect(page.getByRole("dialog")).toContainText(
      index === 0 ? "Evidence is used" : "reliability",
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await expect(
    page.getByRole("heading", { name: "Feedback", exact: true }),
  ).toBeVisible();
  await page.reload();
  for (const [index, word] of ["support", "reliability"].entries())
    await expect(
      page.getByRole("button", {
        name: `Gap ${index + 1}: Correct. Explain`,
        exact: true,
      }),
    ).toContainText(word);
});
test("word-bank guidance follows clearing and replacement modes for every item", async ({
  page,
}) => {
  await drill(page, "Fill in the Blanks \\(Drag and Drop\\)");
  await start(page);
  const clearing = page.getByText("Select a filled blank to clear it.", {
    exact: true,
  });
  for (let item = 0; item < 4; item++) {
    const [first, second] = await page
      .getByLabel("Word bank", { exact: true })
      .getByRole("button")
      .allTextContents();
    const firstWord = page.getByRole("button", { name: first, exact: true });
    const secondWord = page.getByRole("button", { name: second, exact: true });
    await firstWord.press("Space");
    await page
      .getByRole("button", { name: "Blank 1", exact: true })
      .press("Enter");
    await expect(clearing).toBeVisible();
    await secondWord.press("Enter");
    await expect(clearing).not.toBeVisible();
    await secondWord.press("Enter");
    await expect(clearing).toBeVisible();
    await page
      .getByRole("button", { name: `Blank 1: ${first}`, exact: true })
      .press("Enter");
    await expect(
      page.getByRole("button", { name: "Blank 1", exact: true }),
    ).toHaveText(" ");
    await expect(firstWord).toBeEnabled();
    await firstWord.press("Enter");
    await page
      .getByRole("button", { name: "Blank 1", exact: true })
      .press("Enter");
    await secondWord.press("Space");
    await page
      .getByRole("button", { name: `Blank 1: ${first}`, exact: true })
      .press("Enter");
    await expect(
      page.getByRole("button", { name: `Blank 1: ${second}`, exact: true }),
    ).toHaveText(second);
    await expect(firstWord).toBeEnabled();
    await expect(secondWord).toBeDisabled();
    await expect(clearing).toBeVisible();
    await page
      .getByRole("button", {
        name: item === 3 ? "Finish practice" : "Next",
        exact: true,
      })
      .press("Enter");
  }
  await expect(
    page.getByRole("heading", { name: "Review", exact: true }),
  ).toBeVisible();
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
for (const title of [
  "Summarize Written Text",
  "Write Essay",
  "Summarize Spoken Text",
  "Write from Dictation",
]) {
  test(`writing clipboard preserves text and native undo: ${title}`, async ({
    page,
  }) => {
    await drill(page, title);
    await start(page);
    const input = page.getByRole("textbox", {
      name: "Your response",
      exact: true,
    });
    await expect(input).toBeEnabled();
    const text = "Academic knowledge matters.";
    const undo = process.platform === "darwin" ? "Meta+z" : "Control+z";
    const redo =
      process.platform === "darwin" ? "Meta+Shift+z" : "Control+Shift+z";
    await input.fill(text);
    await input.press("ControlOrMeta+a");
    await page.getByRole("button", { name: "Paste", exact: true }).click();
    await expect(input).toHaveValue(text);
    expect(
      await input.evaluate((el: HTMLTextAreaElement) => [
        el.selectionStart,
        el.selectionEnd,
      ]),
    ).toEqual([0, text.length]);
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await input.press("ArrowRight");
    for (const action of ["Copy", "Cut"]) {
      await page.getByRole("button", { name: action, exact: true }).click();
      await expect(input).toHaveValue(text);
    }
    await page.getByRole("button", { name: "Paste", exact: true }).click();
    await expect(input).toHaveValue(text + text);
    await input.press(undo);
    await expect(input).toHaveValue(text);
    await input.press(redo);
    await expect(input).toHaveValue(text + text);
    await input.press(undo);
    await input.press("ControlOrMeta+a");
    await page.getByRole("button", { name: "Cut", exact: true }).click();
    await expect(input).toHaveValue("");
    await input.press(undo);
    await expect(input).toHaveValue(text);
    await input.press(redo);
    await expect(input).toHaveValue("");
    await page.getByRole("button", { name: "Paste", exact: true }).click();
    await expect(input).toHaveValue(text);
    expect(
      await input.evaluate((el: HTMLTextAreaElement) => [
        el.selectionStart,
        el.selectionEnd,
      ]),
    ).toEqual([text.length, text.length]);
    await end(page);
    await expect(page.getByRole("main")).toContainText(
      /Academic.*knowledge.*matters/s,
    );
    // Review renders before the asynchronous save commits. Reload only after
    // its existing success receipt, then verify the persisted clipboard edit.
    await expect(
      page.getByText("Practice saved", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(page.getByRole("main")).toContainText(
      /Academic.*knowledge.*matters/s,
    );
  });
}

for (const failure of ["unsupported", "throws"] as const) {
  test(`writing clipboard retains the response when native editing ${failure}`, async ({
    page,
  }) => {
    await drill(page, "Write Essay");
    await start(page);
    const input = page.getByRole("textbox", {
      name: "Your response",
      exact: true,
    });
    const text = "Academic knowledge matters.";
    await input.fill(text);
    await input.press("ControlOrMeta+a");
    await page.getByRole("button", { name: "Copy", exact: true }).click();
    await page.evaluate((mode) => {
      const original = document.execCommand.bind(document);
      document.execCommand = (command, ...args) => {
        if (command !== "insertText") return original(command, ...args);
        if (mode === "throws") throw new Error("Controlled unsupported edit");
        return false;
      };
    }, failure);
    for (const action of ["Cut", "Paste"]) {
      await page.getByRole("button", { name: action, exact: true }).click();
      await expect(input).toHaveValue(text);
      await expect(page.getByRole("status")).toHaveText(
        "This browser could not edit the selection. Use keyboard shortcuts.",
      );
      expect(
        await input.evaluate((el: HTMLTextAreaElement) => [
          el.selectionStart,
          el.selectionEnd,
        ]),
      ).toEqual([0, text.length]);
    }
    // Native keyboard editing still works; no extra undo implementation or state.
    await input.press("Backspace");
    await expect(input).toHaveValue("");
    await input.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
    await expect(input).toHaveValue(text);
  });
}

test("writing tools count words and ten minute timer advances forward", async ({
  page,
}) => {
  await drill(page, "Summarize Written Text");
  await start(page);
  await page
    .getByRole("textbox", { name: "Your response" })
    .fill("Community gardens need clear rules.");
  await page
    .getByRole("textbox", { name: "Your response" })
    .press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Cut", exact: true }).click();
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(page.getByText("Total Word Count: 5")).toBeVisible();
  await page.clock.install();
  await page.clock.fastForward(600500);
  await expect(page.getByText("2 of 2", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Your response" }),
  ).toHaveValue("");
  await page
    .getByRole("textbox", { name: "Your response" })
    .press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await page.getByRole("button", { name: "Paste", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Your response" }),
  ).toHaveValue("");
  await end(page);
  await expect(page.getByRole("main")).toContainText(
    "Community gardens need clear rules.",
  );
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
  await expect(
    page.getByRole("group", { name: "Prompt recording", exact: true }),
  ).toBeVisible();
  const transcript = page.getByText(/surveys the site carefully/);
  await expect(transcript).toHaveCount(0);
  const source = page.getByRole("button", { name: "Open source", exact: true });
  await source.click();
  const dialog = page.getByRole("dialog");
  const next = dialog.getByRole("button", {
    name: "Next detail pages",
    exact: true,
  });
  for (let i = 0; i < 20 && !(await transcript.isVisible()); i++) {
    await expect(next).toBeEnabled();
    await next.click();
  }
  await expect(dialog.getByText(/surveys the site carefully/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(source).toBeFocused();
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
    page.getByLabel("Your recording", { exact: true }),
  ).toBeVisible();
  const responsePlayer = page.getByRole("group", {
    name: "Your recording",
    exact: true,
  });
  await responsePlayer
    .getByRole("button", {
      name: "Play Your recording",
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
  await expect(
    page.getByRole("heading", { name: "Feedback", exact: true }),
  ).toBeVisible();
  await expect(responsePlayer).toBeVisible();
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
    page.getByLabel("Your recording", { exact: true }),
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
    page.getByText("No responses were saved in this session.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "review questions" }),
  ).toHaveCount(0);
  await expect(page.locator(".exam")).toHaveCount(0);
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
    page.getByText("No responses were saved in this session.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "review questions" }),
  ).toHaveCount(0);
  await expect(page.locator(".exam")).toHaveCount(0);
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
  await expect(page.locator("audio")).toHaveAttribute(
    "src",
    "/audio/headphone-check.wav",
  );
  await page.locator("audio").evaluate(async (el: HTMLAudioElement) => {
    await el.play();
  });
  await expect
    .poll(() =>
      page.locator("audio").evaluate((el: HTMLAudioElement) => el.duration),
    )
    .toBe(3);
  await expect
    .poll(() =>
      page.locator("audio").evaluate((el: HTMLAudioElement) => el.currentTime),
    )
    .toBeGreaterThan(0);
  await expect(
    page.getByRole("checkbox", { name: "I can hear the audio clearly" }),
  ).toBeVisible();
});

test("multiple choices expose incorrect selections and explain the result", async ({
  page,
}) => {
  await drill(page, "Multiple Choice, Multiple Answers");
  await start(page);
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await end(page);
  await expect(
    page.getByRole("heading", { name: "Feedback", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Option C: Selected · Incorrect/ })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "2 correct selections, 2 incorrect, 0 missed",
  );
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
    page.getByRole("button", { name: "Gap 1: Correct. Explain", exact: true }),
  ).toContainText("society");
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
  await expect(
    page.locator(".comparison-token.diff-good").first(),
  ).toBeVisible();
  await expect(page.locator(".friendly-feedback .diff-bad")).toHaveCount(0);
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
      if (file.endsWith("/index.html"))
        body = body
          .toString()
          .replace(
            "<head>",
            `<head><meta name="test-pack-version" content="${version}">`,
          );
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
  const observer = await page.context().newPage();
  try {
    await page.goto(origin);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    await observer.goto(origin);
    await expect(
      observer.locator('meta[name="test-pack-version"]'),
    ).toHaveAttribute("content", "1");
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
    await expect(
      observer.getByRole("button", { name: "Reload to update", exact: true }),
    ).toBeVisible();
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
    await expect(
      page.locator('meta[name="test-pack-version"]'),
    ).toHaveAttribute("content", "2");
    // Another tab's activation must not reload this document automatically.
    await expect(
      observer.locator('meta[name="test-pack-version"]'),
    ).toHaveAttribute("content", "1");
    await observer
      .getByRole("button", { name: "Reload to update", exact: true })
      .click();
    await expect(
      observer.locator('meta[name="test-pack-version"]'),
    ).toHaveAttribute("content", "2");
    await expect(
      observer.getByRole("button", { name: "Reload to update" }),
    ).toHaveCount(0);
    await expect(
      observer.getByRole("button", {
        name: "10 XP, level 1. View progress",
      }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(async () =>
          (await caches.keys()).filter((k) => k.includes("browser-update-")),
        ),
      )
      .toEqual([`pte-studio:${origin}/:pte-studio-browser-update-2`]);
  } finally {
    await observer.close();
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
test("daily quest earns real XP and badges and stays saved in history", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "0 XP, level 1. View progress" }),
  ).toBeVisible();
  await openAchievements(page);
  await page
    .getByRole("button", { name: "First spark, not earned. View achievement" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("0 / 1 so far");
  await page.keyboard.press("Escape");
  await page
    .getByRole("link", { name: "PTE Studio home", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start daily quest", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Daily practice", exact: true }),
  ).toBeVisible();
  await start(page);
  for (let i = 0; i < 3; i++) {
    await answerReading(page);
    await page
      .getByRole("button", {
        name: i === 2 ? "Finish practice" : "Next",
        exact: true,
      })
      .click();
  }
  const completion = page
    .locator("[data-sonner-toast]")
    .filter({ hasText: "Daily practice complete!" });
  await expect(completion).toContainText("+60 XP");
  await expect(completion).toContainText("First spark");
  await expect(
    page.getByRole("region", { name: "Practice rewards" }),
  ).toHaveCount(0);
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
  await expect(
    page.getByRole("heading", { name: "Daily goal complete", exact: true }),
  ).toBeVisible();
  await openAchievements(page);
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
  await page
    .getByRole("button", { name: /XP, level \d+\. View progress/ })
    .click();
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
  ).toHaveCount(0);
  await expect(page.locator(".confetti")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "60 XP, level 1. View progress" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My practice", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Clear.*history/i }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".history-row")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "60 XP, level 1. View progress" }),
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
  await page
    .getByRole("link", { name: "PTE Studio home", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Start daily quest", exact: true })
    .click();
  await start(page);
  await answerReading(page);
  await end(page);
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: "+10 XP" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Practice rewards" }),
  ).toHaveCount(0);
  await expect(page.locator(".confetti")).toBeHidden();
  await page
    .getByRole("button", { name: "10 XP, level 1. View progress" })
    .click();
  await page
    .getByRole("link", { name: "PTE Studio home", exact: true })
    .click();
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
    page.getByRole("navigation", { name: "review questions", exact: true }),
  ).toHaveCount(0);
  // Review renders immediately; XP is published only after the save commits.
  await expect(
    page.getByRole("button", { name: "10 XP, level 1. View progress" }),
  ).toBeVisible();
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
    await page.route("**/audio/headphone-check.wav", (route) => route.abort());
    await page.goto("/practice/type/repeat-sentence");
    await expect(
      page.getByRole("button", { name: "Retry Headphone check", exact: true }),
    ).toBeVisible();
    await page.unroute("**/audio/headphone-check.wav");
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
    await expect(
      page.getByRole("button", {
        name: /^(Practice screen|View level and streak)$/,
      }),
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

test("daily home groups progress and actions across fresh, partial and completed states", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Start daily quest", exact: true }),
  ).toBeEnabled();
  for (const done of [0, 1, 3]) {
    await page.evaluate(async (count) => {
      const date = new Date();
      const today = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");
      const ids = [
        "reading-single-01",
        "reading-single-02",
        "reading-multiple-01",
      ].slice(0, count);
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("pte-studio", 2);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("progress", "readwrite");
          tx.objectStore("progress").put(
            {
              version: 1,
              xp: count === 3 ? 60 : count * 10,
              seen: ids,
              earned: [],
              days: [{ date: today, questionIds: ids }],
              lastDay: count ? today : "",
              streak: count ? 1 : 0,
              longest: count ? 1 : 0,
            },
            "profile",
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
        request.onerror = () => reject(request.error);
      });
    }, done);
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 360, height: 640 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.reload();
      const daily = page.getByRole("region", {
        name: "Daily practice",
        exact: true,
      });
      await expect(daily.getByRole("progressbar")).toHaveAttribute(
        "aria-valuenow",
        String(done),
      );
      await expect(daily.getByRole("heading")).toHaveText(
        done === 3
          ? "Daily goal complete"
          : done
            ? "2 more to go"
            : "Your next 3 questions",
      );
      const action = daily.getByRole("button", {
        name:
          done === 3
            ? "Keep practising"
            : done
              ? "Continue daily quest"
              : "Start daily quest",
        exact: true,
      });
      await expect(action).toBeEnabled();
      await expect(
        daily.getByRole("button", { name: "View achievements" }),
      ).toHaveCount(0);
      await expect(page.locator(".practice-modes a")).toHaveCount(3);
      await screenFits(page);
      const bounds = await daily.evaluate((node) => {
        const card = node.getBoundingClientRect();
        return [
          ...node.querySelectorAll("h3, [role=progressbar], button"),
        ].every((child) => {
          const r = child.getBoundingClientRect();
          return (
            r.top >= card.top &&
            r.bottom <= card.bottom &&
            r.left >= card.left &&
            r.right <= card.right
          );
        });
      });
      expect(bounds).toBe(true);
      await page.screenshot({
        path: `test-results/home-${done}-${viewport.width}.png`,
        animations: "disabled",
      });
    }
  }
  await expect(
    page.getByRole("button", { name: "How practice XP works" }),
  ).toHaveCount(0);
  await openAchievements(page);
  await expect(
    page.getByRole("heading", { name: "Your achievements" }),
  ).toBeVisible();
  await page.goto("/");
  await page
    .getByRole("button", { name: "Keep practising", exact: true })
    .click();
  await expect(page).toHaveURL(/\/types$/);
  for (const height of [400, 451, 500, 540, 560, 561]) {
    await page.setViewportSize({ width: 320, height });
    await page.goto("/");
    const keepPractising = page.getByRole("button", {
      name: "Keep practising",
      exact: true,
    });
    await keepPractising.scrollIntoViewIfNeeded();
    await expect(keepPractising).toBeInViewport();
    const card = page.getByRole("region", {
      name: "Daily practice",
      exact: true,
    });
    expect(
      await card.evaluate((node) => {
        const panel = node.getBoundingClientRect();
        const action = node
          .querySelector(".quest-start")!
          .getBoundingClientRect();
        return action.bottom <= panel.bottom;
      }),
    ).toBe(true);
    for (const link of await page.locator(".practice-modes a").all()) {
      await link.scrollIntoViewIfNeeded();
      await expect(link).toBeInViewport();
    }
  }
});

test("catalogue reload restores search, sections and the current page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/types");
  await page
    .getByRole("button", { name: "Filter: Speaking & Writing", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Filter: Reading", exact: true })
    .click();
  await page.getByRole("searchbox").fill("a");
  await page
    .getByRole("button", { name: "Next question type pages", exact: true })
    .click();
  const pager = page.getByRole("navigation", {
    name: "question type pages",
    exact: true,
  });
  await expect(pager.getByRole("status")).toHaveText("2 / 3");
  await expect(
    page.getByRole("button", {
      name: "Select Missing Word Listening",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("searchbox")).toHaveValue("a");
  for (const [name, pressed] of [
    ["Speaking & Writing", "false"],
    ["Reading", "false"],
    ["Listening", "true"],
  ])
    await expect(
      page.getByRole("button", { name: `Filter: ${name}`, exact: true }),
    ).toHaveAttribute("aria-pressed", pressed);
  await expect(pager.getByRole("status")).toHaveText("2 / 3");
  await page
    .getByRole("button", { name: "Select Missing Word Listening", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "All question types", exact: true })
    .click();
  await expect(page.getByRole("searchbox")).toHaveValue("a");
  await expect(pager.getByRole("status")).toHaveText("2 / 3");
});

test("catalogue matches padded searches without changing typed text or sections", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/types");
  const search = page.getByRole("searchbox");
  const filter = (name: string) =>
    page.getByRole("button", { name: `Filter: ${name}`, exact: true });
  const dropdown = page.getByRole("button", {
    name: /^Fill in the Blanks \(Dropdown\) Reading(?: 5)?$/,
  });
  const bank = page.getByRole("button", {
    name: /^Fill in the Blanks \(Drag and Drop\) Reading(?: 4)?$/,
  });
  const pager = page.getByRole("navigation", {
    name: "question type pages",
    exact: true,
  });
  await filter("Speaking & Writing").click();
  await filter("Listening").click();
  await search.fill("  BlAnKs  ");
  await expect(dropdown).toBeVisible();
  await expect(bank).toBeVisible();
  await expect(pager).toHaveCount(0);
  await dropdown.click();
  await page
    .getByRole("button", { name: "All question types", exact: true })
    .click();
  await page.reload();
  await expect(search).toHaveValue("  BlAnKs  ");
  await expect(dropdown).toBeVisible();
  await expect(bank).toBeVisible();
  await expect(filter("Reading")).toHaveAttribute("aria-pressed", "true");
  await expect(filter("Listening")).toHaveAttribute("aria-pressed", "false");
  await expect(filter("Speaking & Writing")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await search.fill(" \t ");
  await expect(dropdown).toBeVisible();
  await expect(pager.getByRole("status")).toHaveText("1 / 2");
  await pager.getByRole("button", { name: "Next question type pages" }).click();
  await expect(pager.getByRole("status")).toHaveText("2 / 2");
  await search.fill("  blanks  ");
  await expect(dropdown).toBeVisible();
  await expect(bank).toBeVisible();
  await expect(pager).toHaveCount(0);
  await filter("Reading").click();
  await expect(
    page.getByText("No question types found.", { exact: true }),
  ).toBeVisible();
  await filter("Reading").click();
  await expect(dropdown).toBeVisible();
  await search.fill("  no matching question type  ");
  await expect(
    page.getByText("No question types found.", { exact: true }),
  ).toBeVisible();
  await expect(pager).toHaveCount(0);
  await page.setViewportSize({ width: 1280, height: 720 });
  await search.fill("\u00a0Blanks\u00a0");
  await expect(dropdown).toBeVisible();
  await expect(bank).toBeVisible();
  await expect(search).toHaveValue("\u00a0Blanks\u00a0");
});

test("invalid catalogue snapshots fall back to the complete catalogue", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/types");
  const valid = {
    version: 1,
    selectedSections: ["listening"],
    search: "a",
    index: 1,
  };
  for (const raw of [
    "{",
    JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ ...valid, selectedSections: ["unknown"] }),
    JSON.stringify({ ...valid, selectedSections: ["listening", "listening"] }),
    JSON.stringify({ ...valid, search: 7 }),
    JSON.stringify({ ...valid, index: -1 }),
  ]) {
    await page.evaluate(
      (value) => sessionStorage.setItem("pte:catalogue:/", value),
      raw,
    );
    await page.reload();
    await expect(page.getByRole("searchbox")).toHaveValue("");
    for (const name of ["Speaking & Writing", "Reading", "Listening"])
      await expect(
        page.getByRole("button", { name: `Filter: ${name}`, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    await expect(
      page.getByRole("button", { name: /^Read Aloud/ }),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});

for (const blocked of ["getter", "getItem", "setItem"] as const) {
  test(`catalogue remains usable when tab storage blocks ${blocked}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((mode) => {
      if (mode === "getter") {
        Object.defineProperty(window, "sessionStorage", {
          get() {
            throw new DOMException(
              "Controlled blocked storage",
              "SecurityError",
            );
          },
        });
      } else {
        const original = Storage.prototype[mode] as (
          ...args: string[]
        ) => unknown;
        Object.defineProperty(Storage.prototype, mode, {
          configurable: true,
          value: function (this: Storage, key: string, ...args: string[]) {
            if (key.startsWith("pte:catalogue:"))
              throw new DOMException(
                "Controlled storage failure",
                mode === "setItem" ? "QuotaExceededError" : "SecurityError",
              );
            return original.call(this, key, ...args);
          },
        });
      }
    }, blocked);
    await page.goto("/types");
    await page.getByRole("searchbox").fill("Select Missing Word");
    await expect(page.locator(".type-row")).toHaveCount(1);
    await page.getByRole("button", { name: /^Select Missing Word/ }).click();
    await page
      .getByRole("button", { name: "All question types", exact: true })
      .click();
    await expect(page.getByRole("searchbox")).toHaveValue(
      "Select Missing Word",
    );
    await page.reload();
    await expect(page.getByRole("searchbox")).toBeVisible();
    expect(errors).toEqual([]);
  });
}

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
  await page.reload();
  await expect(page.getByText("No question types found.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear filters", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("searchbox").fill("");
  for (const filter of [reading, listening, speaking])
    if ((await filter.getAttribute("aria-pressed")) === "false")
      await filter.click();
  for (const filter of [reading, listening, speaking])
    await expect(filter).toHaveAttribute("aria-pressed", "true");
});

test("populated compact history pages fit without overlapping pagination", async ({
  page,
}, info) => {
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
    await expect(
      page.getByRole("heading", { name: "Sessions.", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Clear.*history/i }),
    ).toHaveCount(0);
    if (size.width === 390 && size.height === 844) {
      await page.screenshot({ path: info.outputPath("sessions-mobile.png") });
    }
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

test("TanStack local state saves and reviews an answered session fully offline", async ({
  page,
  context,
  baseURL,
}) => {
  const external: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (
      /^https?:/.test(request.url()) &&
      new URL(request.url()).origin !== new URL(baseURL!).origin
    )
      external.push(request.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await context.setOffline(true);
  await page.goto("/practice/type/reading-single");
  await start(page);
  await page
    .getByRole("radio", { name: "Difficulty scheduling early meetings" })
    .check();
  await end(page);
  await expect(
    page.getByRole("button", { name: "10 XP, level 1. View progress" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Difficulty scheduling early meetings", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My practice", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: /Clear.*history/i }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".history-row")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "10 XP, level 1. View progress" }),
  ).toBeVisible();
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe("speech model notifications", () => {
  // The bootstrap now registers before app startup. Keep this download-failure
  // fixture deterministic; service-worker/update behavior has separate journeys.
  test.use({ serviceWorkers: "block" });
  test("header notifications disclose speech preparation, errors and recovery", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    let releaseDownload!: () => void;
    const downloadGate = new Promise<void>((resolve) => {
      releaseDownload = resolve;
    });
    await page.route("**/models/blended-english-v3/**", async (route) => {
      await downloadGate;
      await route.fulfill({ status: 503, body: "Download unavailable" });
    });
    await page.goto("/");
    const bell = page.getByRole("button", {
      name: "Notifications",
      exact: true,
    });
    await expect(
      page
        .locator("header")
        .getByRole("button", { name: "Notifications", exact: true }),
    ).toBeVisible();
    await expect(bell).toHaveAccessibleDescription(
      /Preparing required speech model/,
    );
    await expect(
      page.locator(".workspace > .required-speech-model"),
    ).toHaveCount(0);
    await expect(
      page.getByRole("progressbar", { name: "Speech model download" }),
    ).toHaveCount(0);
    await bell.focus();
    await page.keyboard.press("Enter");
    const popover = page.getByRole("dialog", {
      name: "Notifications",
      exact: true,
    });
    await expect(
      popover
        .getByRole("list", { name: "Notifications" })
        .getByRole("listitem"),
    ).toHaveCount(1);
    await expect(
      popover.getByRole("progressbar", { name: "Speech model download" }),
    ).toHaveAttribute("value", "0");
    await page.keyboard.press("Escape");
    await expect(popover).toBeHidden();
    await expect(bell).toBeFocused();
    for (const size of [
      { width: 1440, height: 900 },
      { width: 360, height: 640 },
    ]) {
      await page.setViewportSize(size);
      await bell.click();
      await expect(popover).toBeVisible();
      const box = await popover.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(size.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(size.height);
      await page.locator("h1").click();
      await expect(popover).toBeHidden();
    }
    releaseDownload();
    await expect(bell).toHaveAccessibleDescription(/needs attention/);
    await bell.click();
    await expect(popover.getByRole("alert")).toContainText(/download failed/);
    await expect(popover.getByRole("progressbar")).toHaveCount(0);
    // Retry against the real local assets; do not bypass integrity verification.
    await page.unroute("**/models/blended-english-v3/**");
    await popover.getByRole("button", { name: "Retry model download" }).click();
    await expect(popover.getByRole("progressbar")).toBeVisible();
    await expect(
      popover.getByText("No notifications", { exact: true }),
    ).toBeVisible({ timeout: 90_000 });
    await expect(bell).toHaveAccessibleDescription("No notifications.");
    await expect(popover.getByRole("listitem")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(bell).toBeFocused();
    await page.reload();
    await expect(bell).toHaveAccessibleDescription("No notifications.", {
      timeout: 30_000,
    });
    await bell.click();
    await expect(
      page
        .getByRole("dialog", { name: "Notifications", exact: true })
        .getByText("No notifications", { exact: true }),
    ).toBeVisible();
  });
});

test.describe("short mock recovery layout", () => {
  test.use({ serviceWorkers: "block" });
  test("mock details and preparation remain reachable above the mobile footer", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 320, height: 568 });
    await page.route("**/models/**", (route) => route.abort());
    for (const scale of [1, 2]) {
      await page.goto("/mocks");
      await expect(page.getByRole("alert")).toContainText(
        "Offline setup failed",
      );
      if (scale === 2)
        await page.addStyleTag({
          content: "html { font-size: 200% !important; }",
        });
      await page
        .getByRole("button", { name: "Mock details", exact: true })
        .click({ timeout: 2000 });
      await expect(
        page.getByRole("dialog", { name: "Mock details", exact: true }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "Prepare for mock", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Full mock 01", exact: true }),
      ).toBeVisible();
    }
  });
});

test("all practice cleanup: every guide, section and mock keeps useful text without filler pages", async ({
  page,
  context,
}, info) => {
  test.setTimeout(180000);
  await context.route("**/models/**", (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { readFile } = await import("node:fs/promises");
  const read = async (name: string) =>
    JSON.parse(
      await readFile(
        new URL(`../content/${name}.json`, import.meta.url),
        "utf8",
      ),
    );
  const sourceGuides = await read("guides");
  const sourceSections = await read("sections");
  const sourceMocks = await read("mock-tests");
  const readPages = async (label: string) => {
    const panel = page.locator(".reading-copy");
    const next = page.getByRole("button", {
      name: `Next ${label}`,
      exact: true,
    });
    const parts = [];
    for (let i = 0; i < 80; i++) {
      await expect
        .poll(() =>
          panel.evaluate((node) => node.scrollHeight <= node.clientHeight + 1),
        )
        .toBe(true);
      parts.push(await panel.innerText());
      if (!(await next.count()) || (await next.isDisabled()))
        return parts.join(" ");
      await next.click();
    }
    throw new Error("Reading failed to reach its last page");
  };
  const covered = [];
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const guide of sourceGuides) {
      await page.goto(`/types/${guide.id}`);
      await expect(
        page.getByRole("heading", { name: guide.title, exact: true }),
      ).toHaveCount(1);
      await expect(
        page.getByRole("button", { name: "Instructions", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(await readPages("reading pages")).toContain(guide.instructions);
      await expect(
        page.getByText(/One skill at a time|Open a guide, or jump straight in/),
      ).toHaveCount(0);
      for (const [tab, expected] of [
        ["Strategy & tips", [...guide.tips, guide.pitfall].join(" ")],
        ["How to review", guide.scoring],
      ]) {
        await page.getByRole("button", { name: tab, exact: true }).click();
        expect(await readPages("reading pages")).toBe(expected);
        await screenFits(page);
      }
      covered.push(`guide:${guide.id}:${viewport.width}`);
    }
    for (const section of sourceSections) {
      await page.goto(`/sections/${section.id}`);
      await expect(
        page.getByRole("button", { name: "Section details", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: section.title, exact: true }),
      ).toBeVisible();
      await screenFits(page);
      covered.push(`section:${section.id}:${viewport.width}`);
    }
    await page.goto("/mocks");
    await page
      .getByRole("button", { name: "Mock details", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(
      "shared with question-type and section practice",
    );
    await expect(dialog).not.toContainText("min limit");
    await expect(dialog).toContainText(
      "Exact live-test UI parity is unverified",
    );
    await page.keyboard.press("Escape");
    for (const mock of sourceMocks)
      covered.push(`mock:${mock.id}:${viewport.width}`);
    if (viewport.width === 390) {
      await page.goto("/types/reading-multiple");
      await page
        .getByRole("button", { name: "Strategy & tips", exact: true })
        .click();
      await page.screenshot({
        path: info.outputPath("compact-guide-mobile.png"),
      });
    }
  }
  expect(covered).toHaveLength(
    (sourceGuides.length + sourceSections.length + sourceMocks.length) * 2,
  );
  await info.attach("coverage", {
    body: JSON.stringify(covered),
    contentType: "application/json",
  });
});

test("all practice cleanup: every setup route retains exactly its required device checks", async ({
  page,
  context,
}, info) => {
  test.setTimeout(120000);
  await context.route("**/models/**", (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { readFile } = await import("node:fs/promises");
  const read = async (name: string) =>
    JSON.parse(
      await readFile(
        new URL(`../content/${name}.json`, import.meta.url),
        "utf8",
      ),
    );
  const sourceGuides = await read("guides"),
    sourceQuestions = await read("questions"),
    sourceSections = await read("sections"),
    sourceMocks = await read("mock-tests");
  const plans = [
    ...sourceGuides.map((g: { id: string }) => ({
      path: `/practice/type/${g.id}`,
      items: sourceQuestions.filter((q: { type: string }) => q.type === g.id),
    })),
    ...sourceSections.map((s: { id: string }) => ({
      path: `/practice/section/${s.id}`,
      items: sourceQuestions.filter(
        (q: { type: string }) =>
          sourceGuides.find((g: { id: string }) => g.id === q.type).section ===
          s.id,
      ),
    })),
    ...sourceMocks.map((m: { id: string; questionIds: string[] }) => ({
      path: `/practice/mock/${m.id}`,
      items: sourceQuestions.filter((q: { id: string }) =>
        m.questionIds.includes(q.id),
      ),
    })),
    { path: "/practice/type/daily", items: [] },
  ];
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const plan of plans) {
      await page.goto(plan.path);
      const needMic = plan.items.some(
        (q: { type: string }) =>
          sourceGuides.find((g: { id: string }) => g.id === q.type).kind ===
          "speak",
      );
      const needAudio = plan.items.some((q: { audio?: string }) => q.audio);
      await expect(
        page.getByRole("group", { name: "Headphone check", exact: true }),
      ).toHaveCount(needAudio ? 1 : 0);
      if (needAudio)
        await expect(
          page
            .getByRole("group", { name: "Headphone check", exact: true })
            .locator("audio"),
        ).toHaveAttribute("src", "/audio/headphone-check.wav");
      await expect(
        page.getByRole("button", { name: "Test microphone", exact: true }),
      ).toHaveCount(needMic ? 1 : 0);
      const begin = page.getByRole("button", {
        name: /Begin (practice|mock test)/,
      });
      if (needAudio || needMic) await expect(begin).toBeDisabled();
      else await expect(begin).toBeEnabled();
      await expect(
        page.getByText("Ready to begin?", { exact: true }),
      ).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(viewport.width);
      await begin.scrollIntoViewIfNeeded();
      await expect(begin).toBeInViewport();
    }
    await page.goto("/practice/mock/" + sourceMocks[0].id);
    await expect(
      page.getByText("Practice details", { exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".setup-rules li").nth(2)).toContainText(
      "Once you begin, leaving or refreshing ends this attempt.",
    );
    if (viewport.width === 320)
      await page.screenshot({
        path: info.outputPath("compact-mock-setup-mobile.png"),
        fullPage: true,
      });
  }
});

test("all practice cleanup: unanswered questions and full mocks produce no review questions", async ({
  page,
  context,
}, info) => {
  test.setTimeout(180000);
  await context.route("**/models/**", (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { readFile } = await import("node:fs/promises");
  const sourceQuestions = JSON.parse(
    await readFile(
      new URL("../content/questions.json", import.meta.url),
      "utf8",
    ),
  );
  const sourceMocks = JSON.parse(
    await readFile(
      new URL("../content/mock-tests.json", import.meta.url),
      "utf8",
    ),
  );
  await page.goto("/");
  await page.evaluate(
    async ({ questions, mocks }) => {
      const attempts = [
        ...mocks.map(
          (m: { id: string; title: string; questionIds: string[] }) => ({
            id: `cleanup-${m.id}`,
            label: m.title,
            questionIds: m.questionIds,
          }),
        ),
        {
          id: "cleanup-every-question",
          label: "Every original question",
          questionIds: questions.map((q: { id: string }) => q.id),
        },
      ].map((r) => ({
        ...r,
        date: new Date().toISOString(),
        answers: {},
        finished: true,
      }));
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
            tx.objectStore("attempts").put(
              { result, recordings: {} },
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
      localStorage.setItem("pte-studio-history-v1", JSON.stringify(attempts));
    },
    { questions: sourceQuestions, mocks: sourceMocks },
  );
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const attempt of [
      {
        id: "cleanup-every-question",
        questionIds: sourceQuestions.map((q: { id: string }) => q.id),
      },
      ...sourceMocks.map((m: { id: string; questionIds: string[] }) => ({
        id: `cleanup-${m.id}`,
        questionIds: m.questionIds,
      })),
    ]) {
      await page.goto(`/history/${attempt.id}`);
      await expect(
        page.getByText("No responses were saved in this session."),
      ).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "review questions" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("group", { name: "Review panels" }),
      ).toHaveCount(0);
      await screenFits(page);
    }
  }
  await info.attach("review-coverage", {
    body: JSON.stringify({
      questions: sourceQuestions.map((q: { id: string }) => q.id),
      mocks: sourceMocks.map((m: { id: string }) => m.id),
      viewports: [390, 1440],
    }),
    contentType: "application/json",
  });
});

test("all practice cleanup: every active response kind keeps its controls and one media status", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  await context.route("**/models/**", (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { readFile } = await import("node:fs/promises");
  const sourceGuides = JSON.parse(
    await readFile(new URL("../content/guides.json", import.meta.url), "utf8"),
  );
  const sourceQuestions = JSON.parse(
    await readFile(
      new URL("../content/questions.json", import.meta.url),
      "utf8",
    ),
  );
  await page.clock.install();
  const kinds = new Set();
  for (const guide of sourceGuides) {
    const q = sourceQuestions.find(
      (q: { type: string }) => q.type === guide.id,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/practice/type/${guide.id}`);
    if (guide.kind === "speak") {
      await page
        .getByRole("button", { name: "Test microphone", exact: true })
        .click();
      await expect(
        page.getByRole("group", {
          name: "Microphone check playback",
          exact: true,
        }),
      ).toBeVisible();
    }
    const checkbox = page.getByRole("checkbox", {
      name: "I can hear the audio clearly",
    });
    if (await checkbox.count()) await checkbox.check();
    await start(page);
    if (q.audio) {
      await page.clock.fastForward(3100);
      await expect(page.locator(".recording-panel")).toHaveCount(1);
      // An ended event bounds the per-type rendering audit. Native audio playback,
      // one-play behavior and recording timing have separate focused journeys.
      await page
        .locator(".exam-main audio")
        .evaluate((audio: HTMLAudioElement) => {
          audio.pause();
          audio.dispatchEvent(new Event("ended"));
        });
      if (guide.kind === "speak" && guide.prepSeconds)
        await page.clock.fastForward(guide.prepSeconds * 1000 + 100);
    } else if (guide.kind === "speak")
      await page.clock.fastForward((guide.prepSeconds + 1) * 1000);
    if (guide.kind === "speak")
      await expect(page.getByText("Recording", { exact: true })).toBeVisible();
    else if (q.audio)
      await expect(page.locator(".recording-panel")).toHaveCount(0);
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(
        page.getByText(
          /Current Status:|Recorded Answer|Original practice data/,
        ),
      ).toHaveCount(0);
      await expect(
        page.getByText(guide.instructions, { exact: true }),
      ).toBeVisible();
      if (guide.kind === "single")
        await expect(page.getByRole("radio")).toHaveCount(q.options.length);
      else if (guide.kind === "multi")
        await expect(page.getByRole("checkbox")).toHaveCount(q.options.length);
      else if (["write", "dictation"].includes(guide.kind))
        await expect(
          page.getByRole("textbox", { name: "Your response", exact: true }),
        ).toBeEnabled();
      else if (guide.kind === "dropdown")
        await expect(page.getByRole("combobox")).toHaveCount(q.answers.length);
      else if (guide.kind === "blanks")
        await expect(page.getByRole("textbox")).toHaveCount(q.answers.length);
      else if (guide.kind === "bank")
        await expect(
          page.getByRole("button", { name: "Blank 1", exact: true }),
        ).toBeEnabled();
      else if (guide.kind === "order")
        await expect(page.locator(".paragraph")).toHaveCount(q.options.length);
      else if (guide.kind === "highlight")
        await expect(page.locator(".highlight-text button")).toHaveCount(
          q.text.split(/\s+/).length,
        );
      if (q.chart) await expect(page.getByRole("figure")).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBe(viewport.width);
    }
    kinds.add(guide.kind);
    await page.clock.resume();
  }
  expect(kinds.size).toBe(10);
});

test("playtest: daily preparation stays compact and previews one guide at a time", async ({
  page,
  context,
}, info) => {
  await context.route("**/models/**", (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/practice/type/daily");
    const preview = page.getByRole("button", {
      name: /Preview .* daily practice questions/,
    });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByLabel("Upcoming question type")).toHaveCount(0);
    await expect(page.locator(".setup-rules li")).toHaveCount(3);
    await page.screenshot({
      path: info.outputPath(`preparation-${viewport.width}.png`),
      animations: "disabled",
    });
    await preview.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const choices = await dialog.locator("option").allTextContents();
    await page.screenshot({
      path: info.outputPath(`preview-${viewport.width}.png`),
      animations: "disabled",
    });
    expect(choices.length).toBeGreaterThan(1);
    for (const title of choices) {
      await page
        .getByLabel("Upcoming question type")
        .selectOption({ label: title });
      await expect(dialog).toContainText("30 min shared timer");
      await expect(
        dialog.locator('[data-slot="dialog-description"]'),
      ).not.toBeEmpty();
    }
    await expect(page.locator(".exam")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(preview).toBeFocused();
    await expect(
      page.getByRole("button", { name: "Begin practice", exact: true }),
    ).toBeEnabled();
  }
  await page.goto("/practice/type/reorder-paragraphs");
  await expect(
    page.getByRole("button", { name: /Preview .* daily practice questions/ }),
  ).toHaveCount(0);
});

test("playtest: final blank answer can cancel or finish without changing earlier Next", async ({
  page,
  context,
}) => {
  await context.route("**/models/**", (route) => route.abort());
  await page.goto("/practice/type/reading-single");
  await start(page);
  await page
    .getByRole("radio", { name: "Difficulty scheduling early meetings" })
    .check();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("2 of 2", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Finish practice", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Finish practice?");
  await page
    .getByRole("button", { name: "Keep practising", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("2 of 2", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Finish practice", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Finish practice", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "review questions", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "My practice", exact: true }).click();
  await expect(page.locator(".history-row")).toHaveCount(1);
});

test("a pre-React recovery control survives a missing entry bundle", async ({
  page,
}) => {
  const { recoveryServer } = await import("./helpers/recovery-server.mjs");
  let phase = 3;
  const server = await recoveryServer({ phase: () => phase });
  try {
    await page.goto(server.origin);
    await expect(
      page.getByRole("heading", { name: "Let’s reopen your practice" }),
    ).toBeVisible({ timeout: 20000 });
    await page.evaluate(() =>
      localStorage.setItem("recovery-test-marker", "retained"),
    );
    phase = 2;
    await page.getByRole("button", { name: "Reload app", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Practice", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem("recovery-test-marker")),
    ).toBe("retained");
  } finally {
    await server.close();
  }
});
test("a broken pre-guard cached shell recovers while retained recordings survive", async ({
  page,
  context,
}) => {
  const { recoveryServer } = await import("./helpers/recovery-server.mjs");
  let phase = 1;
  const server = await recoveryServer({ phase: () => phase });
  try {
    await page.goto(server.origin);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await expect
      .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
      .toBe(true);
    await page.evaluate(async () => {
      localStorage.setItem("recovery-test-marker", "retained");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open("recovery-fixture", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("recordings");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("recordings", "readwrite");
        tx.objectStore("recordings").put(
          new Blob(["retained audio"]),
          "original",
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    });
    await page.reload();
    await expect(page.locator("body")).toHaveText("");
    phase = 2;
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())!.update();
    });
    await expect(
      page.getByRole("heading", { name: "Practice", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    expect(
      await page.evaluate(() => localStorage.getItem("recovery-test-marker")),
    ).toBe("retained");
    expect(
      await page.evaluate(async () => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const r = indexedDB.open("recovery-fixture");
          r.onsuccess = () => resolve(r.result);
        });
        const blob = await new Promise<Blob>((resolve) => {
          const r = db
            .transaction("recordings")
            .objectStore("recordings")
            .get("original");
          r.onsuccess = () => resolve(r.result);
        });
        db.close();
        return blob.text();
      }),
    ).toBe("retained audio");
  } finally {
    await server.close();
  }
});
test("broken-shell rescue cannot activate across an active attempt tab", async ({
  page,
  context,
}) => {
  const { recoveryServer } = await import("./helpers/recovery-server.mjs");
  let phase = 1;
  const server = await recoveryServer({ phase: () => phase });
  const active = await context.newPage();
  try {
    await page.goto(server.origin);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await active.goto(server.origin + "/practice/type/repeat-sentence/run");
    const marker = await active.evaluate(() => {
      (window as any).__activeMarker = crypto.randomUUID();
      return (window as any).__activeMarker;
    });
    phase = 2;
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())!.update();
    });
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            !!(await navigator.serviceWorker.getRegistration())?.waiting,
        ),
      )
      .toBe(true);
    expect(await active.evaluate(() => (window as any).__activeMarker)).toBe(
      marker,
    );
    expect(await page.evaluate(() => caches.keys())).toContain(
      `pte-studio:${server.origin}/:pte-studio-broken-53`,
    );
  } finally {
    await active.close();
    await server.close();
  }
});

test("playtest: full question titles open on touch and keyboard without crowding the header", async ({
  page,
  context,
}) => {
  await context.route("**/models/**", (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const size of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/types/summarize-group-discussion");
    const trigger = page.getByRole("button", {
      name: "Show full title: Summarize Group Discussion",
      exact: true,
    });
    await expect(
      page.getByRole("heading", {
        name: "Summarize Group Discussion",
        exact: true,
      }),
    ).toBeVisible();
    if (size.width === 390)
      expect((await trigger.boundingBox())!.width).toBeGreaterThan(80);
    await trigger.focus();
    await page.keyboard.press("Enter");
    const popup = page.locator('[data-slot="popover-content"]');
    await expect(popup).toHaveText("Summarize Group Discussion");
    await expect
      .poll(() => popup.evaluate((el) => el.scrollWidth <= el.clientWidth + 1))
      .toBe(true);
    await page.keyboard.press("Escape");
    await expect(popup).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(popup).toBeVisible();
    await trigger.click();
    await expect(popup).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(size.width);
    await expect(
      page.getByRole("button", { name: "Start practice", exact: true }),
    ).toBeVisible();
  }
});

test("short progress keeps every weekly activity mark above the fixed footer", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await context.route("**/models/**", (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Start daily quest", exact: true }),
  ).toBeEnabled();
  // These profiles exercise every current level-title variant, not reward logic.
  for (const xp of [270, 0, 600, 1200]) {
    await page.evaluate(async (amount) => {
      const date = new Date();
      const today = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
      ].join("-");
      const ids = amount
        ? ["reading-single-01", "reading-single-02", "reading-multiple-01"]
        : [];
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open("pte-studio", 2);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("progress", "readwrite");
          tx.objectStore("progress").put(
            {
              version: 1,
              xp: amount,
              seen: ids,
              earned: [],
              days: amount ? [{ date: today, questionIds: ids }] : [],
              lastDay: amount ? today : "",
              streak: amount ? 1 : 0,
              longest: amount ? 1 : 0,
            },
            "profile",
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
        request.onerror = () => reject(request.error);
      });
    }, xp);
    for (const size of [
      { width: 320, height: 480 },
      { width: 320, height: 400 },
      { width: 320, height: 451 },
      { width: 320, height: 560 },
      { width: 320, height: 561 },
      { width: 320, height: 640 },
      { width: 390, height: 480 },
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 1280, height: 720 },
    ]) {
      await page.setViewportSize(size);
      await page.goto("/progress");
      await expect(
        page.getByRole("button", { name: new RegExp(`^${xp} XP, level`) }),
      ).toBeVisible();
      const days = page.locator(".activity-day");
      await expect(days).toHaveCount(7);
      for (const day of await days.all()) {
        await day.focus();
        await expect
          .poll(
            async () =>
              day.evaluate((node) => {
                const r = node.getBoundingClientRect();
                const main = document
                  .querySelector("main")!
                  .getBoundingClientRect();
                const footer = document
                  .querySelector('[aria-label="Mobile navigation"]')
                  ?.getBoundingClientRect();
                const bottom =
                  footer && footer.height
                    ? Math.min(main.bottom, footer.top)
                    : main.bottom;
                return (
                  r.top >= main.top - 1 &&
                  r.bottom <= bottom + 1 &&
                  r.left >= main.left - 1 &&
                  r.right <= main.right + 1
                );
              }),
            {
              message: `${xp} XP at ${size.width}x${size.height}: complete day mark must be reachable above footer`,
            },
          )
          .toBe(true);
      }
      expect(
        await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          headerTop: document.querySelector("header")!.getBoundingClientRect()
            .top,
          scrollY,
        })),
      ).toEqual({
        width: size.width,
        height: size.height,
        headerTop: 0,
        scrollY: 0,
      });
      if (size.height > 560) {
        expect(
          await page
            .locator("main")
            .evaluate((node) => node.scrollHeight <= node.clientHeight + 1),
        ).toBe(true);
      }
    }
  }
});

test("saved sessions expose section identity without changing history or review", async ({
  page,
}) => {
  await page.route("**/models/**", (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const variants = (guideData as Guide[]).map((g) => ({
    id: `history-section-${g.id}`,
    label: g.title,
    section: sections.find((s) => s.id === g.section)!.title,
    icon: { speaking: "mic", reading: "book-open", listening: "headphones" }[
      g.section
    ],
    questionIds: questions.filter((q) => q.type === g.id).map((q) => q.id),
  }));
  variants.push(
    {
      id: "history-section-reading-run",
      label: "Reading practice",
      section: "Reading",
      icon: "book-open",
      questionIds: questions
        .filter((q) => q.type.startsWith("reading-"))
        .map((q) => q.id),
    },
    {
      id: "history-section-mixed",
      label: "Daily practice",
      section: "Mixed sections",
      icon: "history",
      questionIds: [
        "read-aloud-01",
        "reading-single-01",
        "listening-single-01",
      ],
    },
    {
      id: "history-section-empty",
      label: "Practice session",
      section: "Practice session",
      icon: "history",
      questionIds: [],
    },
  );
  for (let offset = 0; offset < variants.length; offset += 8) {
    const batch = variants.slice(offset, offset + 8);
    const entries = batch.map((v) => ({
      id: v.id,
      label: v.label,
      date: "2026-10-17T01:00:00.000Z",
      questionIds: v.questionIds,
      answers: Object.fromEntries(
        v.questionIds.map((id) => [id, { values: ["0"] }]),
      ),
      finished: true,
    }));
    await page.evaluate(async (entries) => {
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
          for (const result of entries)
            tx.objectStore("attempts").put(
              { result, recordings: {} },
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
      localStorage.setItem("pte-studio-history-v1", JSON.stringify(entries));
    }, entries);
    for (const size of [
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
      { width: 320, height: 480 },
    ]) {
      await page.setViewportSize(size);
      await page.goto("/history");
      const seen = new Set<string>();
      do {
        for (const row of await page.locator(".history-row").all()) {
          const href = await row.getAttribute("href");
          const v = batch.find((v) => href === `/history/${v.id}`)!;
          expect(v).toBeTruthy();
          await expect(row).toHaveAccessibleName(new RegExp(v.section));
          await expect(row.locator(`svg.lucide-${v.icon}`)).toHaveCount(1);
          await expect(row.locator("small")).toContainText("17 Oct 2026");
          seen.add(v.id);
        }
        await screenFits(page);
        const next = page.getByRole("button", {
          name: "Next attempt pages",
          exact: true,
        });
        if (!(await next.count()) || (await next.isDisabled())) break;
        await next.click();
      } while (true);
      expect([...seen].sort()).toEqual(batch.map((v) => v.id).sort());
      await page.reload();
      expect(
        await page.evaluate(() =>
          JSON.parse(localStorage.getItem("pte-studio-history-v1")!),
        ),
      ).toEqual(entries);
    }
  }
  // Same title/date/count: only the section identifies the correct saved activity.
  await page.setViewportSize({ width: 1280, height: 720 });
  const duplicates = variants.filter((v) =>
    [
      "reading-single",
      "reading-multiple",
      "listening-single",
      "listening-multiple",
    ].some((id) => v.id === `history-section-${id}`),
  );
  await page.evaluate(
    (ids) => {
      // These records were already written to this isolated fixture database above.
      localStorage.setItem("pte-studio-history-v1", JSON.stringify(ids));
    },
    duplicates.map((v) => ({
      id: v.id,
      label: v.label,
      date: "2026-10-17T01:00:00.000Z",
      questionIds: v.questionIds,
      answers: {},
      finished: true,
    })),
  );
  await page.goto("/history");
  for (const v of duplicates) {
    const row = page.locator(`a.history-row[href="/history/${v.id}"]`);
    await expect(row).toHaveAccessibleName(new RegExp(v.section));
    await row.focus();
    await row.press("Tab");
    await page.keyboard.press("Shift+Tab");
    const tooltip = page.locator('[data-slot="tooltip-content"][data-open]');
    await expect(tooltip).toHaveText(v.section);
    await expect(tooltip).toBeVisible();
    await page.keyboard.press("Escape");
    await row.press("Enter");
    await expect(page).toHaveURL(`/history/${v.id}`);
    await expect(
      page.getByRole("heading", { name: "Review", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Open source", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "My practice", exact: true })
      .click();
  }
});

test("short desktop sidebar reveals every destination for wheel and keyboard navigation", async ({
  page,
}) => {
  await page.route("**/models/**", (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  const names = [
    "Practice",
    "Question types",
    "Section practice",
    "Mock tests",
    "Learn about PTE",
    "My practice",
  ];
  for (const size of [
    { width: 844, height: 390 },
    { width: 768, height: 480 },
    { width: 1280, height: 400 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/types/summarize-written-text");
    const sidebar = page.locator(".sidebar");
    const nav = page.getByRole("navigation", {
      name: "Main navigation",
      exact: true,
    });
    await expect(nav.getByRole("link")).toHaveCount(6);
    await sidebar.hover({ position: { x: 48, y: size.height / 2 } });
    await page.mouse.wheel(0, 600);
    if (size.height < 520)
      await expect
        .poll(() => sidebar.evaluate((e) => e.scrollTop))
        .toBeGreaterThan(0);
    else {
      expect(await sidebar.evaluate((e) => e.scrollTop)).toBe(0);
      expect(
        await sidebar.evaluate((e) => e.scrollHeight <= e.clientHeight),
      ).toBe(true);
    }
    for (const [name, path] of [
      ["My practice", "/history"],
      ["Learn about PTE", "/guide"],
    ]) {
      const link = nav.getByRole("link", { name, exact: true });
      const rect = await link.boundingBox();
      expect(rect!.y).toBeGreaterThanOrEqual(0);
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(size.height);
      await link.click();
      await expect(page).toHaveURL(path);
    }
    await sidebar.hover({ position: { x: 48, y: size.height / 2 } });
    await page.mouse.wheel(0, -600);
    await expect.poll(() => sidebar.evaluate((e) => e.scrollTop)).toBe(0);
    await sidebar
      .getByRole("link", { name: "PTE Studio home", exact: true })
      .press("Tab");
    for (let i = 0; i < names.length; i++) {
      const link = nav.getByRole("link", { name: names[i], exact: true });
      await expect(link).toBeFocused();
      await expect
        .poll(async () => {
          const r = await link.boundingBox();
          return r!.y >= 0 && r!.y + r!.height <= size.height;
        })
        .toBe(true);
      expect((await link.boundingBox())!.height).toBe(56);
      expect(
        await page
          .locator(".topbar")
          .evaluate((e) => e.getBoundingClientRect().top),
      ).toBe(0);
      await screenFits(page);
      if (i < names.length - 1) await page.keyboard.press("Tab");
    }
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/history");
  }
  for (const size of [
    { width: 390, height: 480 },
    { width: 767, height: 480 },
  ]) {
    await page.setViewportSize(size);
    await page.goto("/types/summarize-written-text");
    await expect(page.locator(".sidebar")).toBeHidden();
    const mobile = page.getByRole("navigation", {
      name: "Mobile navigation",
      exact: true,
    });
    await expect(mobile.getByRole("link")).toHaveCount(3);
    for (const link of await mobile.getByRole("link").all()) {
      const r = await link.boundingBox();
      expect(r!.y).toBeGreaterThanOrEqual(0);
      expect(r!.y + r!.height).toBeLessThanOrEqual(size.height);
    }
    await screenFits(page);
  }
});
