import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for Pulse.
 *
 * Targets http://localhost:3000 (local dev server).
 *
 * WALLET HANDLING ARCHITECTURAL DECISION:
 * ========================================
 * Approach: Mock wallet layer (option B from the prompt).
 *
 * Rationale: Automated E2E tests should NOT drive real MetaMask or submit
 * real on-chain transactions. The class of bugs caught by unit tests
 * (wrong contract calls, wrong addresses, revert conditions) is already
 * covered by the existing vitest suite. E2E tests add value by verifying:
 * - Page loads and renders correctly
 * - Navigation works
 * - Form inputs validate correctly
 * - UI state transitions work (loading, error, success states)
 * - API integration returns real data
 *
 * Real on-chain transaction testing remains a manual human verification
 * step — this is honest about what automated CI can and cannot test.
 * The wallet connection flow is mocked at the wagmi level for E2E tests.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Sequential — pages share state
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Generous timeouts for real blockchain API calls
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  timeout: 60_000, // 60s per test — real API calls can be slow
  expect: {
    timeout: 10_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start dev server before tests, stop after
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000, // 2 min for Next.js cold start
  },
});
