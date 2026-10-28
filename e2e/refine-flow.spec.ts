import { test, expect } from "@playwright/test";

test.describe("Chat Refine Flow", () => {
  test("submits refine prompt, updates plan, and supports undo", async ({
    page,
  }) => {
    // Mock the /api/refine route for fast, deterministic e2e test
    await page.route("**/api/refine", async (route) => {
      const requestData = JSON.parse(route.request().postData() || "{}");
      const currentPlan = requestData.plan;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          changeSummary: "I have reduced your budget by 20% across all categories.",
          plan: {
            ...currentPlan,
            budget: currentPlan.budget.map((b: { category: string; amount: number; percentage: number }) => ({
              ...b,
              amount: Math.round(b.amount * 0.8),
            })),
          },
          diffs: [
            {
              section: "budget",
              action: "update",
              summary: "Cut budget by 20%",
            },
          ],
        }),
      });
    });

    // Start with instant demo replay
    await page.goto("/");
    await page.getByTestId("demo-wedding-mumbai-instant").click();

    // Wait until plan is ready (streaming finished)
    await expect(
      page.getByRole("status", { name: "Generating" }),
    ).toHaveCount(0, { timeout: 25000 });

    // Wait for the refine panel to appear
    const refineHeading = page.getByRole("heading", { name: "Refine plan" });
    const mobileTrigger = page.getByRole("button", { name: /refine plan/i });

    if (await mobileTrigger.isVisible()) {
      await mobileTrigger.click();
    } else {
      await expect(refineHeading).toBeVisible({ timeout: 15000 });
    }

    const refineTextarea = page.getByRole("textbox", {
      name: /refine message/i,
    });
    await expect(refineTextarea).toBeVisible({ timeout: 10000 });

    // Click quick suggestion "Cut budget by 20%" which sends immediately
    const quickChip = page.getByRole("button", { name: "Cut budget by 20%" });
    await expect(quickChip).toBeVisible();
    await quickChip.click();

    // Verify assistant reply appears in chat
    await expect(
      page.getByText("I have reduced your budget by 20% across all categories."),
    ).toBeVisible({ timeout: 10000 });

    // Verify Undo button is rendered
    const undoButton = page.getByRole("button", { name: "Undo", exact: true });
    await expect(undoButton).toBeVisible();

    // Click Undo and verify reversion message appears and Undo button is removed
    await undoButton.click();
    await expect(
      page.getByText("Reverted to the previous plan."),
    ).toBeVisible({ timeout: 10000 });
    await expect(undoButton).toBeHidden();
  });
});
