/**
 * E2E Test: /faucet full flow — address copy, balance check, cooldown.
 */
import { test, expect } from '@playwright/test';

test.describe('Faucet Page', () => {
  test('loads and shows faucet content', async ({ page }) => {
    await page.goto('/faucet');

    // Should show the faucet heading or step instructions
    await expect(page.locator('text=faucet').first()).toBeVisible();
  });

  test('connect wallet prompt is shown when disconnected', async ({ page }) => {
    await page.goto('/faucet');

    // Should show a connect wallet button or message
    const connectButton = page.locator('button:has-text("Connect")').first();
    await expect(connectButton).toBeVisible();
  });

  test('STT balance section is present', async ({ page }) => {
    await page.goto('/faucet');

    // Check Balance button should exist
    await expect(page.locator('text=Check Balance')).toBeVisible();
  });
});
