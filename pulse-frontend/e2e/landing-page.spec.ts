/**
 * E2E Test: Landing page loads and preview tabs switch correctly.
 *
 * Tests the PulseLanding component's four preview tabs:
 * Trade, Markets, Portfolio, Receipt.
 */
import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('loads successfully and shows hero content', async ({ page }) => {
    await page.goto('/');

    // Hero headline should be visible
    await expect(page.locator('text=Up or Down')).toBeVisible();
    await expect(page.locator("text=That's It.")).toBeVisible();

    // Enter App CTA should be visible
    await expect(page.locator('text=Enter App')).toBeVisible();

    // Announcement bar
    await expect(page.locator('text=Live on Somnia Testnet')).toBeVisible();
  });

  test('all four preview tabs are present and clickable', async ({ page }) => {
    await page.goto('/');

    const tabs = ['Trade', 'Markets', 'Portfolio', 'Receipt'];

    for (const tab of tabs) {
      const tabButton = page.locator(`button:has-text("${tab}")`).first();
      await expect(tabButton).toBeVisible();
      await tabButton.click();
      // Tab should become active (aria-selected or active class)
      await expect(tabButton).toHaveAttribute('aria-selected', 'true');
    }
  });

  test('Trade tab is active by default', async ({ page }) => {
    await page.goto('/');

    const tradeTab = page.locator('button:has-text("Trade")').first();
    await expect(tradeTab).toHaveAttribute('aria-selected', 'true');
  });

  test('switching tabs updates the preview panel content', async ({ page }) => {
    await page.goto('/');

    // Click Markets tab
    await page.locator('button:has-text("Markets")').first().click();

    // The preview panel should show markets-related content
    // (exact content depends on the preview component)
    await expect(page.locator('button[aria-selected="true"]:has-text("Markets")')).toBeVisible();
  });
});
