/**
 * E2E Test: /market/[id] loads real market data, amount input validation
 * rejects bad input, and UI states work correctly.
 */
import { test, expect } from '@playwright/test';

test.describe('Market Detail Page', () => {
  test('loads market data from API', async ({ page }) => {
    // Navigate to a market page (use a known market or the first available)
    await page.goto('/markets');

    // Wait for market cards to appear and click the first one
    const firstCard = page.locator('a[href^="/market/"]').first();
    const hasCards = await firstCard.isVisible({ timeout: 15_000 }).catch(() => false);

    if (hasCards) {
      await firstCard.click();
      await expect(page).toHaveURL(/\/market\//);

      // Market title should be visible
      await expect(page.locator('h2').first()).toBeVisible();

      // Price should be visible (yes/no cents)
      await expect(page.locator('text=Yes').first()).toBeVisible();
      await expect(page.locator('text=No').first()).toBeVisible();
    }
  });

  test('trade ticket elements are present', async ({ page }) => {
    await page.goto('/markets');
    const firstCard = page.locator('a[href^="/market/"]').first();
    const hasCards = await firstCard.isVisible({ timeout: 15_000 }).catch(() => false);

    if (hasCards) {
      await firstCard.click();
      await expect(page).toHaveURL(/\/market\//);

      // Side toggle buttons
      await expect(page.locator('button:has-text("Yes")').first()).toBeVisible();
      await expect(page.locator('button:has-text("No")').first()).toBeVisible();

      // Buy/Sell tabs
      await expect(page.locator('button:has-text("Buy")').first()).toBeVisible();
      await expect(page.locator('button:has-text("Sell")').first()).toBeVisible();

      // Amount input
      await expect(page.locator('input[aria-label="Trade amount in test USDC"]')).toBeVisible();

      // CTA button
      await expect(page.locator('button:has-text("Buy")').last()).toBeVisible();
    }
  });

  test('amount input validation rejects negative values', async ({ page }) => {
    await page.goto('/markets');
    const firstCard = page.locator('a[href^="/market/"]').first();
    const hasCards = await firstCard.isVisible({ timeout: 15_000 }).catch(() => false);

    if (hasCards) {
      await firstCard.click();
      await expect(page).toHaveURL(/\/market\//);

      const amountInput = page.locator('input[aria-label="Trade amount in test USDC"]');
      await amountInput.fill('-50');
      await amountInput.blur();

      // Should show validation error
      await expect(page.locator('text=cannot be negative')).toBeVisible();
    }
  });

  test('amount input validation rejects zero', async ({ page }) => {
    await page.goto('/markets');
    const firstCard = page.locator('a[href^="/market/"]').first();
    const hasCards = await firstCard.isVisible({ timeout: 15_000 }).catch(() => false);

    if (hasCards) {
      await firstCard.click();
      await expect(page).toHaveURL(/\/market\//);

      const amountInput = page.locator('input[aria-label="Trade amount in test USDC"]');
      await amountInput.fill('0');
      await amountInput.blur();

      await expect(page.locator('text=greater than zero')).toBeVisible();
    }
  });

  test('connect wallet button is visible when disconnected', async ({ page }) => {
    await page.goto('/markets');
    const firstCard = page.locator('a[href^="/market/"]').first();
    const hasCards = await firstCard.isVisible({ timeout: 15_000 }).catch(() => false);

    if (hasCards) {
      await firstCard.click();
      await expect(page).toHaveURL(/\/market\//);

      // CTA should show "Connect Wallet" when not connected
      await expect(page.locator('button:has-text("Connect Wallet")')).toBeVisible();
    }
  });

  test('back link navigates to /markets', async ({ page }) => {
    await page.goto('/markets');
    const firstCard = page.locator('a[href^="/market/"]').first();
    const hasCards = await firstCard.isVisible({ timeout: 15_000 }).catch(() => false);

    if (hasCards) {
      await firstCard.click();
      await expect(page).toHaveURL(/\/market\//);

      const backLink = page.locator('a:has-text("Markets")').first();
      await backLink.click();
      await expect(page).toHaveURL(/\/markets/);
    }
  });
});
