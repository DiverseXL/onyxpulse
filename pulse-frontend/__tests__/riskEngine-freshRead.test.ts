/**
 * BUG 5 Regression Test — Risk engine reads enabled flag fresh.
 *
 * The original bug was that the risk-limit check used a stale/cached value
 * of the "enabled" flag instead of reading it fresh from localStorage at
 * submission time. This meant toggling risk limits OFF in /settings did
 * NOT actually disable the check — the old cached "enabled: true" was used.
 *
 * This test verifies that loadSettings is called at submission time (fresh read),
 * not captured earlier in the component lifecycle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Track all calls to loadSettings ────────────────────────────────────────────

const mockLoadSettings = vi.fn();

vi.mock('@/lib/settings', () => ({
  loadSettings: (...args: unknown[]) => mockLoadSettings(...args),
}));

vi.mock('@/lib/engine/trading', () => ({
  placeMarketOrder: vi.fn().mockResolvedValue({ hash: '0xabc' }),
  placeLimitOrder: vi.fn().mockResolvedValue({ hash: '0xdef' }),
}));

vi.mock('@/lib/engine/client', () => ({
  createPulseClient: () => ({
    client: {
      createTrader: () => ({}),
      getMarketByPool: vi.fn().mockResolvedValue(null),
      getBinaryBookParams: vi.fn().mockResolvedValue({
        tickSize: 1000000n,
        lotSize: 1000000n,
        minQuantity: 1000000n,
      }),
    },
  }),
}));

const mockCheckRiskLimits = vi.fn();
vi.mock('@/lib/engine/riskEngine', () => ({
  checkRiskLimits: (...args: unknown[]) => mockCheckRiskLimits(...args),
}));

import { placeClientOrder } from '@/lib/wallet/placeOrder';

describe('BUG 5: risk engine reads enabled flag fresh', () => {
  const mockWalletClient = { chain: { id: 50312 } } as any;
  const mockAccount = { address: '0x1234567890abcdef1234567890abcdef12345678' } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips risk check when enabled is false (fresh read at submission time)', async () => {
    // Simulate: user turned OFF risk limits in settings
    mockLoadSettings.mockReturnValue({
      riskLimitsEnabled: false,
      riskLimits: { maxPositionSizePerMarket: '100', maxOpenMarkets: 5, maxTotalExposure: '500' },
    });

    await placeClientOrder(mockWalletClient, mockAccount, {
      poolAddress: '0xpool1',
      marketId: '0xmarket1',
      side: 'BUY_YES',
      priceCents: 62,
      amount: 10,
    });

    // loadSettings MUST be called (fresh read, not cached)
    expect(mockLoadSettings).toHaveBeenCalledTimes(1);
    expect(mockLoadSettings).toHaveBeenCalledWith(mockAccount.address);

    // checkRiskLimits MUST NOT be called when disabled
    expect(mockCheckRiskLimits).not.toHaveBeenCalled();
  });

  it('calls risk check when enabled is true', async () => {
    mockLoadSettings.mockReturnValue({
      riskLimitsEnabled: true,
      riskLimits: { maxPositionSizePerMarket: '100', maxOpenMarkets: 5, maxTotalExposure: '500' },
    });
    mockCheckRiskLimits.mockResolvedValue({ allowed: true });

    await placeClientOrder(mockWalletClient, mockAccount, {
      poolAddress: '0xpool1',
      marketId: '0xmarket1',
      side: 'BUY_YES',
      priceCents: 62,
      amount: 10,
    });

    expect(mockLoadSettings).toHaveBeenCalledTimes(1);
    expect(mockCheckRiskLimits).toHaveBeenCalledTimes(1);
  });

  it('reads fresh settings on EACH submission (not cached from first call)', async () => {
    // First call: enabled
    mockLoadSettings.mockReturnValueOnce({
      riskLimitsEnabled: true,
      riskLimits: { maxPositionSizePerMarket: '100', maxOpenMarkets: 5, maxTotalExposure: '500' },
    });
    mockCheckRiskLimits.mockResolvedValue({ allowed: true });

    await placeClientOrder(mockWalletClient, mockAccount, {
      poolAddress: '0xpool1',
      marketId: '0xmarket1',
      side: 'BUY_YES',
      priceCents: 62,
      amount: 10,
    });

    expect(mockCheckRiskLimits).toHaveBeenCalledTimes(1);

    // Second call: user toggled OFF between submissions
    mockLoadSettings.mockReturnValueOnce({
      riskLimitsEnabled: false,
      riskLimits: { maxPositionSizePerMarket: '100', maxOpenMarkets: 5, maxTotalExposure: '500' },
    });

    await placeClientOrder(mockWalletClient, mockAccount, {
      poolAddress: '0xpool1',
      marketId: '0xmarket1',
      side: 'BUY_NO',
      priceCents: 45,
      amount: 20,
    });

    // loadSettings called again (fresh read)
    expect(mockLoadSettings).toHaveBeenCalledTimes(2);

    // checkRiskLimits should NOT be called on second submission (disabled now)
    expect(mockCheckRiskLimits).toHaveBeenCalledTimes(1); // still 1 from first call
  });

  it('source code reads settings at submission time, not at module load', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../lib/wallet/placeOrder.ts'),
      'utf-8',
    );

    // loadSettings must be called INSIDE the function body, not at module level
    // Check that it appears after the function signature
    const functionStart = source.indexOf('export async function placeClientOrder');
    const loadSettingsCall = source.indexOf('loadSettings(account.address)');
    expect(loadSettingsCall).toBeGreaterThan(functionStart);
  });
});
