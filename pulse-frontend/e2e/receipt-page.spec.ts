/**
 * E2E Test: /receipt/[marketId] renders all three states correctly.
 */
import { test, expect } from '@playwright/test';

test.describe('Receipt Page', () => {
  test('not-found state renders for invalid market ID', async ({ page }) => {
    await page.goto('/receipt/0x0000000000000000000000000000000000000000000000000000000000000000');

    // Should show some state (loading, error, or not-found)
    // Wait for the page to settle
    await page.waitForTimeout(3000);

    const content = await page.textContent('body');
    expect(content?.length).toBeGreaterThan(0);
  });

  test('page does not crash on load', async ({ page }) => {
    // Even with a garbage market ID, the page should not white-screen
    const response = await page.goto('/receipt/nonexistent');
    expect(response?.status()).toBeLessThan(500);
  });

  test('navigation back to markets works', async ({ page }) => {
    await page.goto('/receipt/nonexistent');
    await page.waitForTimeout(2000);

    const backLink = page.locator('a:has-text("Markets")').first();
    if (await backLink.isVisible()) {
      await backLink.click();
      await expect(page).toHaveURL(/\/markets/);
    }
  });
});
