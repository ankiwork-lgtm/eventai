import { test, expect } from "@playwright/test";

test.describe("Demo Mode Replay", () => {
  test("Mumbai wedding cached plan streams and shows budget tab", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByTestId("demo-wedding-mumbai-instant").click();

    // Verify redirected to plan page
    await expect(page).toHaveURL(/\/plan\/[a-f0-9-]+/);

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
    await page.goto("/");
    await page.getByTestId("demo-birthday-superhero-instant").click();

    await expect(page).toHaveURL(/\/plan\/[a-f0-9-]+/);
    await expect(
      page.getByRole("status", { name: "Generating" }),
    ).toHaveCount(0, { timeout: 25000 });

    await expect(page.getByRole("tab", { name: /^budget$/i })).toBeVisible();
  });

  test("Community Diwali cached plan replays successfully", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("demo-community-diwali-instant").click();

    await expect(page).toHaveURL(/\/plan\/[a-f0-9-]+/);
    await expect(
      page.getByRole("status", { name: "Generating" }),
    ).toHaveCount(0, { timeout: 25000 });

    await expect(page.getByRole("tab", { name: /^budget$/i })).toBeVisible();
  });
});
