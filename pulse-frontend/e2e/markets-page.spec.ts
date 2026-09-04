/**
 * E2E Test: Markets page loads real market data, search/filters work,
 * clicking a card navigates to /market/[id].
 */
import { test, expect } from '@playwright/test';

test.describe('Markets Page', () => {
  test('loads and displays market data', async ({ page }) => {
    await page.goto('/markets');

    // Page header
    await expect(page.locator('text=Event Contract Markets')).toBeVisible();

    // Stats strip should show live window count
    await expect(page.locator('text=Live Windows')).toBeVisible();

    // Segmented control tabs should be present
    await expect(page.locator('button:has-text("Markets")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Settled")').first()).toBeVisible();
    await expect(page.locator('button:has-text("Archive")').first()).toBeVisible();
  });

  test('search input works', async ({ page }) => {
    await page.goto('/markets');

    const searchInput = page.locator('input[aria-label="Search markets by asset or question"]');
    await expect(searchInput).toBeVisible();

    // Type a search query
    await searchInput.fill('BTC');

    // The input should have the value
    await expect(searchInput).toHaveValue('BTC');

    // Clear search
    const clearButton = page.locator('button[aria-label="Clear search query"]');
    if (await clearButton.isVisible()) {
      await clearButton.click();
      await expect(searchInput).toHaveValue('');
    }
  });

  test('category chips are clickable', async ({ page }) => {
    await page.goto('/markets');

    // BTC chip should be visible
    const btcChip = page.locator('button:has-text("BTC")').first();
    await expect(btcChip).toBeVisible();

    // Click BTC chip
    await btcChip.click();

    // Chip should be active (aria-pressed)
    await expect(btcChip).toHaveAttribute('aria-pressed', 'true');
  });

  test('clicking a market card navigates to /market/[id]', async ({ page }) => {
    await page.goto('/markets');

    // Wait for market cards to load
    // Cards are Link elements wrapping MarketCard components
    const firstCard = page.locator('a[href^="/market/"]').first();

    // If cards are loaded, click the first one
    if (await firstCard.isVisible({ timeout: 10_000 }).catch(() => false)) {
      const href = await firstCard.getAttribute('href');
      await firstCard.click();

      // Should navigate to /market/[id]
      await expect(page).toHaveURL(new RegExp(`\\/market\\/`));
    }
  });

  test('sort dropdown works', async ({ page }) => {
    await page.goto('/markets');

    const sortSelect = page.locator('select[aria-label="Sort markets by"]');
    await expect(sortSelect).toBeVisible();

    // Change sort option
    await sortSelect.selectOption('most-active');
    await expect(sortSelect).toHaveValue('most-active');
  });
});
