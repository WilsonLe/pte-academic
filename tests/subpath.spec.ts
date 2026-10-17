import { test as base, expect } from "@playwright/test";
const test = base.extend<{ noPageErrors: void }>({
  noPageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await use();
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});
test("subdirectory static build retains manifest, audio and offline navigation", async ({
  page,
  context,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "pte:catalogue:/",
      JSON.stringify({
        version: 1,
        selectedSections: [],
        search: "wrong base",
        index: 0,
      }),
    ),
  );
  await page.goto("/pte-academic/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Practice", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Main navigation", exact: true })
    .getByRole("link", { name: "Question types", exact: true })
    .click();
  await expect(page.locator(".type-row").first()).toContainText("Read Aloud");
  await page.getByRole("searchbox").fill("Write from Dictation");
  await expect(page.locator(".type-row")).toHaveCount(1);
  await expect(page.locator(".type-row")).toContainText("Write from Dictation");
  await expect(page).toHaveURL(/\/pte-academic\/types$/);
  await page.reload();
  await expect(page.getByRole("searchbox")).toHaveValue("Write from Dictation");
  await expect(page.locator(".type-row")).toHaveCount(1);
  const audio = await page.evaluate(async () => {
    const r = await fetch("/pte-academic/audio/repeat-sentence-01.mp3", {
      headers: { Range: "bytes=0-127" },
    });
    return {
      status: r.status,
      length: (await r.arrayBuffer()).byteLength,
      range: r.headers.get("content-range"),
    };
  });
  expect(audio.status).toBe(206);
  expect(audio.length).toBe(128);
  expect(audio.range).toMatch(/^bytes 0-127\//);
  await page.goto("/pte-academic/practice/type/summarize-spoken-text");
  const headphone = page.getByRole("group", {
    name: "Headphone check",
    exact: true,
  });
  await expect(headphone.locator("audio")).toHaveAttribute(
    "src",
    "/pte-academic/audio/headphone-check.wav",
  );
  await headphone
    .getByRole("button", { name: "Play Headphone check", exact: true })
    .click();
  await expect
    .poll(() =>
      headphone
        .locator("audio")
        .evaluate((node: HTMLAudioElement) => node.currentTime),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      headphone
        .locator("audio")
        .evaluate((node: HTMLAudioElement) => node.duration),
    )
    .toBe(3);
});

test("Learn study-step deep links survive offline subdirectory reload and return", async ({
  page,
  context,
}) => {
  await page.goto("/pte-academic/guide/first-week?section=3");
  const topic = page.getByRole("combobox", { name: "Learning topic" });
  await expect(topic).toHaveValue("2");
  await expect(
    page.getByRole("region", { name: "Learning article" }),
  ).toContainText("Try a complete section with the timer running.");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await page.reload();
  await expect(topic).toHaveValue("2");
  await page.getByRole("button", { name: "Practise", exact: true }).click();
  await expect(page).toHaveURL(/\/pte-academic\/types$/);
  await page.goBack();
  await expect(topic).toHaveValue("2");
  await topic.selectOption({ label: "Overview" });
  await expect(page).toHaveURL(/\/pte-academic\/guide\/first-week$/);
  await page.reload();
  await expect(topic).toHaveValue("-1");
});

test("static 404 shell supports direct history routes without rewrites", async ({
  page,
  context,
}) => {
  const { createServer } = await import("node:http");
  const { readFile } = await import("node:fs/promises");
  const { resolve, extname, sep } = await import("node:path");
  const root = resolve("dist-subpath");
  expect(await readFile(resolve(root, "404.html"), "utf8")).toBe(
    await readFile(resolve(root, "index.html"), "utf8"),
  );
  const mime: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
  };
  const server = createServer(async (request, response) => {
    const path = new URL(request.url!, "http://localhost").pathname;
    if (!path.startsWith("/pte-academic/")) {
      response.writeHead(404).end();
      return;
    }
    let file = resolve(
        root,
        path.slice("/pte-academic/".length) || "index.html",
      ),
      status = 200;
    if (!file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    let body: Buffer;
    try {
      body = await readFile(file);
    } catch {
      if (!request.headers.accept?.includes("text/html")) {
        response.writeHead(404).end();
        return;
      }
      file = resolve(root, "404.html");
      status = 404;
      body = await readFile(file);
    }
    response
      .writeHead(status, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
      })
      .end(body);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server");
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    const response = await page.goto(
      origin + "/pte-academic/history/missing-session",
    );
    expect(response?.status()).toBe(404);
    await expect(
      page.getByText("This session is no longer available on this device."),
    ).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page
      .getByRole("button", { name: "Back to history", exact: true })
      .click();
    await expect(page).toHaveURL(origin + "/pte-academic/history");
    await expect(page.getByText("No attempts yet.")).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText("No attempts yet.")).toBeVisible();
  } finally {
    await context.setOffline(false);
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
  }
});
