/**
 * E2E Test: draft_trade_link prefill support.
 *
 * The hosted Pulse MCP server returns links shaped like
 * /market/{marketId}?prefillSide={side}&prefillAmount={amount}. Opening one
 * should pre-fill the trade ticket's side selector and amount input — and
 * must NEVER auto-submit anything.
 */
import { test, expect } from '@playwright/test';

test.describe('Trade ticket prefill (draft_trade_link)', () => {
  test('pre-fills side + amount and shows the review banner without submitting', async ({ page }) => {
    // Open the markets page and grab the first real market id.
    await page.goto('/markets');
    const firstLink = page.locator('a[href^="/market/"]').first();
    await firstLink.waitFor({ timeout: 15_000 });
    const href = (await firstLink.getAttribute('href')) ?? '';

    // Visit the market with draft_trade_link query params.
    await page.goto(`${href}?prefillSide=no&prefillAmount=37.5`);

    // Trade ticket renders once real market data arrives.
    const amountInput = page.locator('#detail-amount');
    await amountInput.waitFor({ timeout: 30_000 });

    // Amount input is pre-filled with 37.5.
    await expect(amountInput).toHaveValue('37.5');

    // The review banner is visible and honest about nothing being submitted.
    const banner = page.locator('text=Trade pre-filled from a shared link');
    await expect(banner).toBeVisible();

    // Side selector reflects prefillSide=no: the No button carries the active
    // styling while Yes does not.
    const yesActive = await page
      .locator('button', { hasText: /^Yes$/ })
      .first()
      .evaluate((el) => el.className.includes('sideButtonYesActive'));
    const noActive = await page
      .locator('button', { hasText: /^No$/ })
      .first()
      .evaluate((el) => el.className.includes('sideButtonNoActive'));
    expect(yesActive).toBe(false);
    expect(noActive).toBe(true);

    // No order popup or success state may appear — nothing was auto-submitted.
    await expect(page.locator('text=Order Rejected')).toHaveCount(0);
    await expect(page.locator('text=Order placed')).toHaveCount(0);
  });

  test('amount only prefill keeps the default Yes side', async ({ page }) => {
    await page.goto('/markets');
    const firstLink = page.locator('a[href^="/market/"]').first();
    await firstLink.waitFor({ timeout: 15_000 });
    const href = (await firstLink.getAttribute('href')) ?? '';

    await page.goto(`${href}?prefillAmount=100`);

    const amountInput = page.locator('#detail-amount');
    await amountInput.waitFor({ timeout: 30_000 });
    await expect(amountInput).toHaveValue('100');

    const yesActive = await page
      .locator('button', { hasText: /^Yes$/ })
      .first()
      .evaluate((el) => el.className.includes('sideButtonYesActive'));
    expect(yesActive).toBe(true);
  });
});
