import { test, expect } from "@playwright/test";
import questions from "../content/questions.json" with { type: "json" };

test("fresh practice varies saved openers while each active plan and saved review retain their question identities", async ({
  page,
}) => {
  // No known-input fixture: exercise production randomness and retained history.
  const pool = questions.filter((q) => q.type === "summarize-written-text");
  const attempts: string[][] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto("/practice/type/summarize-written-text");
    await page
      .getByRole("button", { name: "Begin practice", exact: true })
      .click();
    const ids: string[] = [];
    for (let i = 0; i < pool.length; i++) {
      const exam = page.locator(".exam");
      await expect(exam).toBeVisible();
      const id = (await exam.getAttribute("data-question-id"))!;
      ids.push(id);
      const question = pool.find((q) => q.id === id)!;
      await expect(page.locator(".exam-main")).toContainText(question.text!);
      await page.getByRole("textbox").fill(`My reflection on ${id}.`);
      await page.setViewportSize(
        i % 2 ? { width: 1440, height: 1000 } : { width: 390, height: 844 },
      );
      await expect(exam).toHaveAttribute("data-question-id", id);
      await page
        .getByRole("button", {
          name: i === pool.length - 1 ? "Finish practice" : "Next",
          exact: true,
        })
        .click();
    }
    await expect(page.locator(".review-screen")).toHaveAttribute(
      "data-question-id",
      ids[0],
    );
    expect([...ids].sort()).toEqual(pool.map((q) => q.id).sort());
    if (attempt) expect(ids[0]).not.toBe(attempts[0][0]);
    attempts.push(ids);
    await expect(
      page.getByText("Practice saved", { exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/history\/[^/]+$/);
    await page.reload();
    for (const [i, id] of ids.entries()) {
      await expect(page.locator(".review-screen")).toHaveAttribute(
        "data-question-id",
        id,
      );
      await expect(
        page.getByRole("region", { name: "Written response", exact: true }),
      ).toContainText(`My reflection on ${id}.`);
      await expect(
        page.getByRole("region", { name: "Original question", exact: true }),
      ).toBeVisible();
      if (i < ids.length - 1)
        await page
          .getByRole("button", { name: "Next review questions", exact: true })
          .click();
    }
  }
});
