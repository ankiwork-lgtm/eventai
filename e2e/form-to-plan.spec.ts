import { test, expect } from "@playwright/test";

test.describe("Intake Form to Plan Generation", () => {
  test("clicking Fill Form fills all required fields in the intake form", async ({
    page,
  }) => {
    await page.goto("/");

    // Click fill form for Mumbai wedding
    await page.getByTestId("demo-wedding-mumbai-fill").click();

    // Verify fields populated
    const eventNameInput = page.locator('input[name="eventName"]');
    await expect(eventNameInput).toHaveValue("Maharashtrian Wedding");

    const guestCountInput = page.locator('input[name="guestCount"]');
    await expect(guestCountInput).toHaveValue("200");

    const budgetInput = page.locator('input[name="totalBudget"]');
    await expect(budgetInput).toHaveValue("1000000");

    const cityInput = page.locator('input[name="city"]');
    await expect(cityInput).toHaveValue("Mumbai");
  });

  test("live streaming plan generation from intake submission", async ({
    page,
  }) => {
    test.skip(
      !process.env.ANTHROPIC_API_KEY,
      "Skipping live LLM test because ANTHROPIC_API_KEY is not set",
    );

    await page.goto("/");
    await page.getByTestId("demo-wedding-mumbai-fill").click();

    // Submit the form
    await page.getByRole("button", { name: /generate plan/i }).click();

    // Verify redirected to plan page
    await expect(page).toHaveURL(/\/plan\/[a-f0-9-]+/);

    // Wait for plan generation to finish
    await expect(
      page.getByRole("status", { name: "Generating" }),
    ).toHaveCount(0, { timeout: 45000 });

    // Verify budget tab is visible
    await expect(page.getByRole("tab", { name: /^budget$/i })).toBeVisible();
  });
});
