/**
 * BUG 3 Regression Test — poolAddress vs marketAddress confusion.
 *
 * The original bug was that the order-submission path used market.marketAddress
 * instead of market.poolAddress as the pool argument. These are different values
 * on the BinaryMarket row — poolAddress is the contract address that actually
 * hosts the order book, while marketAddress is the market identifier.
 *
 * This test FAILS if marketAddress is mistakenly used instead of poolAddress.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the engine functions ──────────────────────────────────────────────────

const mockPlaceMarketOrder = vi.fn().mockResolvedValue({ hash: '0xabc' });
const mockPlaceLimitOrder = vi.fn().mockResolvedValue({ hash: '0xdef' });

vi.mock('@/lib/engine/trading', () => ({
  placeMarketOrder: (...args: unknown[]) => mockPlaceMarketOrder(...args),
  placeLimitOrder: (...args: unknown[]) => mockPlaceLimitOrder(...args),
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

vi.mock('@/lib/engine/riskEngine', () => ({
  checkRiskLimits: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('@/lib/settings', () => ({
  loadSettings: () => ({
    riskLimitsEnabled: false,
    riskLimits: { maxPositionSizePerMarket: '100', maxOpenMarkets: 5, maxTotalExposure: '500' },
  }),
}));

import { placeClientOrder, placeClientLimitOrder } from '@/lib/wallet/placeOrder';

describe('BUG 3: poolAddress vs marketAddress', () => {
  const mockWalletClient = { chain: { id: 50312 } } as any;
  const mockAccount = { address: '0x1234567890abcdef1234567890abcdef12345678' } as any;

  // Deliberately different values — if marketAddress is used instead of poolAddress,
  // the test will fail because the wrong address gets passed through.
  const POOL_ADDRESS = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const MARKET_ADDRESS = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('placeClientOrder passes poolAddress (not marketAddress) to placeMarketOrder', async () => {
    await placeClientOrder(mockWalletClient, mockAccount, {
      poolAddress: POOL_ADDRESS,
      marketId: MARKET_ADDRESS, // This is the market ID, NOT the pool
      side: 'BUY_YES',
      priceCents: 62,
      amount: 10,
    });

    const callArgs = mockPlaceMarketOrder.mock.calls[0][2];
    // The pool argument MUST be the poolAddress, not the marketId/marketAddress
    expect(callArgs.pool).toBe(POOL_ADDRESS);
    expect(callArgs.pool).not.toBe(MARKET_ADDRESS);
  });

  it('placeClientLimitOrder passes poolAddress (not marketAddress) to placeLimitOrder', async () => {
    await placeClientLimitOrder(mockWalletClient, mockAccount, {
      poolAddress: POOL_ADDRESS,
      marketId: MARKET_ADDRESS,
      side: 'BUY_NO',
      priceCents: 45,
      amount: 20,
    });

    const callArgs = mockPlaceLimitOrder.mock.calls[0][2];
    expect(callArgs.pool).toBe(POOL_ADDRESS);
    expect(callArgs.pool).not.toBe(MARKET_ADDRESS);
  });

  it('source code uses poolAddress as the pool argument, not marketAddress', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../lib/wallet/placeOrder.ts'),
      'utf-8',
    );

    // Find the placeMarketOrder / placeLimitOrder calls and verify they use poolAddress
    // The pattern should be: pool: poolAddress as `0x${string}`
    // NOT: pool: marketAddress or pool: data.marketAddress
    expect(source).toMatch(/pool:\s*poolAddress\s+as/);
    expect(source).not.toMatch(/pool:\s*(data\.)?marketAddress/);
  });
});
