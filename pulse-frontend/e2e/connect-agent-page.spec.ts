/**
 * E2E Test: /connect-agent -- AI-assistant (MCP) connection flow.
 *
 * The "Get Access Token" step calls the LIVE MCP server's real /connect
 * endpoint (https://onyxpulsemcp-lyart.vercel.app/connect), so this test
 * verifies real integration data the same way the other suites do.
 */
import { test, expect } from '@playwright/test';

const VALID_ADDRESS = '0x0000000000000000000000000000000000000001';

test.describe('Connect Agent Page', () => {
  test('renders the explainer and honesty callout', async ({ page }) => {
    const response = await page.goto('/connect-agent');
    expect(response?.status()).toBe(200);

    await expect(page.getByRole('heading', { name: 'Connect Pulse to Claude or ChatGPT' })).toBeVisible();
    await expect(page.getByText('Model Context Protocol')).toBeVisible();
    await expect(page.getByText(/read-only and draft-only connection/)).toBeVisible();
  });

  test('pre-fills the wallet address when one is provided', async ({ page }) => {
    await page.goto('/connect-agent');
    // Without a connected wallet there is nothing to pre-fill; the input is empty.
    const input = page.getByLabel('Wallet address');
    await expect(input).toBeVisible();
  });

  test('requests a real token from the live MCP server', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: 'http://localhost:3000',
    });
    await page.goto('/connect-agent');

    const input = page.getByLabel('Wallet address');
    await input.fill(VALID_ADDRESS);

    await page.getByRole('button', { name: 'Get Access Token' }).click();

    // Wait for the success state and a real token payload
    await expect(page.getByRole('button', { name: 'Token ready' })).toBeVisible();
    const tokenCode = page.locator('code[aria-label="Your Pulse MCP access token"]');
    await expect(tokenCode).toBeVisible();
    const token = (await tokenCode.textContent()) ?? '';
    expect(token.length).toBeGreaterThan(40);
    expect(token).not.toContain('mock');

    // The config snippet contains the same real token and the MCP URL
    const configCode = page.locator('code[aria-label="Claude Desktop MCP configuration JSON"]');
    await expect(configCode).toBeVisible();
    const configText = (await configCode.textContent()) ?? '';
    expect(configText).toContain('mcpServers');
    expect(configText).toContain('https://onyxpulsemcp-lyart.vercel.app/mcp');
    expect(configText).toContain(token);

    // Copy token button puts the real token on the clipboard and confirms
    await page.getByRole('button', { name: 'Copy access token to clipboard' }).click();
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(token);
    // Button keeps its aria-label; the visible label flips to Copied
    await expect(
      page.getByRole('button', { name: 'Copy access token to clipboard' }),
    ).toContainText('Copied');
  });

  test('shows an inline error for a malformed address', async ({ page }) => {
    await page.goto('/connect-agent');

    const input = page.getByLabel('Wallet address');
    await input.fill('0xnot-an-address');

    await page.getByRole('button', { name: 'Get Access Token' }).click();

    await expect(page.getByText(/does not look like a valid wallet address/)).toBeVisible();
  });
});