import { test, expect, type Page } from "@playwright/test";

/**
 * Clicks a demo "Generate instantly" button and waits for the plan page.
 *
 * On a cold dev server the first click can land before React has hydrated, so the
 * onClick handler is not attached yet and nothing happens. Retry the click until the
 * navigation actually occurs instead of relying on a fixed timeout.
 */
async function startDemo(page: Page, testId: string) {
  await page.goto("/");
  await expect(async () => {
    await page.getByTestId(testId).click();
    await expect(page).toHaveURL(/\/plan\/[a-f0-9-]+/, { timeout: 2000 });
  }).toPass({ timeout: 30000 });
}

test.describe("Demo Mode Replay", () => {
  test("Mumbai wedding cached plan streams and shows budget tab", async ({
    page,
  }) => {
    await startDemo(page, "demo-wedding-mumbai-instant");

    // Wait for streaming badges across tabs to disappear
    await expect(
      page.getByRole("status", { name: "Generating" }),
    ).toHaveCount(0, { timeout: 25000 });

    // Verify tabs exist and Budget tab is active
    const budgetTab = page.getByRole("tab", { name: /^budget$/i });
    await expect(budgetTab).toBeVisible();

    // Switch to Timeline tab
    const timelineTab = page.getByRole("tab", { name: /^timeline$/i });
    await timelineTab.click();
    await expect(page.getByText(/Add to calendar \(\.ics\)/i)).toBeVisible();

    // Switch to Vendors tab
    const vendorsTab = page.getByRole("tab", { name: /^vendors$/i });
    await vendorsTab.click();
    await expect(page.getByRole("tabpanel")).toBeVisible();

    // Switch to Ideas tab
    const ideasTab = page.getByRole("tab", { name: /^ideas$/i });
    await ideasTab.click();
    await expect(page.getByRole("tabpanel")).toBeVisible();
  });

  test("Superhero birthday cached plan replays successfully", async ({
    page,
  }) => {
    await startDemo(page, "demo-birthday-superhero-instant");
    await expect(
      page.getByRole("status", { name: "Generating" }),
    ).toHaveCount(0, { timeout: 25000 });

    await expect(page.getByRole("tab", { name: /^budget$/i })).toBeVisible();
  });

  test("Community Diwali cached plan replays successfully", async ({ page }) => {
    await startDemo(page, "demo-community-diwali-instant");
    await expect(
      page.getByRole("status", { name: "Generating" }),
    ).toHaveCount(0, { timeout: 25000 });

    await expect(page.getByRole("tab", { name: /^budget$/i })).toBeVisible();
  });
});
